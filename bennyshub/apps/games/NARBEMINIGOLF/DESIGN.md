# NARBE Mini Golf — design and status

A three.js rebuild of Benny's Mini Golf, replacing it in the hub and homepage
game listings. Same inputs and mechanics, new courses, 3D cinematics, and a
new Course Creator. The old source in `../BENNYSMINIGOLF` is retained for
reference.

## Controls (unchanged from the original)

| Context | Two switches (Auto Scan off) | One switch (Auto Scan on) |
| --- | --- | --- |
| Aim | Hold Space to turn the aim; each new press turns the other way | The aim sweeps by itself; Space does nothing |
| Putt — *Hold to Charge* (default) | Hold Enter to charge, let go to putt | Enter stops the sweep and charges; let go to putt |
| Putt — *Choose from List* | Enter opens a list (Tap … Full, Aim Again, Pause) | Same; the list auto-scans |
| Putt — *Automatic* | Enter putts with the suggested power | Same |
| Pause | Hold Enter (ring + rising ticks), or the Pause button / Esc | Same |
| *Easy Pause* setting (off by default) | Before every putt the scan goes between the **putter** (it glows; pick it to putt) and the **Pause** button — Space moves, Enter picks | The scan steps by itself; Enter picks |
| Menus | Space next (on release), hold Space back, Enter select | Auto scan, Enter select |

Holding Enter pauses from anywhere in play. While charging, the pause hold
only starts counting once the meter is full, so charging all the way never
pauses by accident. **Easy Pause** (Settings, user decision 2026-10-02) is for
a player who can't hold a switch: every turn starts with a two-stop scan over
things already on screen — the putter and the Pause button — so the pause
menu is always one press away (ACCESSIBILITY.md §12). No buttons pop up.
Continue from pause returns to the same scan. Intros, celebrations, replays
and the scorecard skip on any press. Mouse/touch: point to aim, hold to
charge, release to putt (with Easy Pause on, a click on the course takes the
putt).

**The camera never moves while the player aims.** The aim view is fixed for
the whole turn from the ball and the line of play (`turnViewYaw` in game.js),
never from the live aim — the user asked for this explicitly. The "Follow
Aim" camera option was removed for the same reason. Camera options are
Cinematic (default) and Overhead.

**The opening aim (and the camera's facing) follows the route.**
`physics.routeField` is a walking-distance map to the cup (round rails,
walls, windmill blocks and ponds; bridges are ground; a tunnel mouth counts
as its exit). `physics.smartAim` aims straight at the cup if the ball can roll
there without touching a rail, wall or water, otherwise at the farthest
point of the route it can see. The old rule (cup, else lane end points) could
pick the lane's start behind the tee — Laser Gates and Mangrove Maze opened
facing backwards. `tools/check-aim.cjs` checks every tee and 60 random spots
per hole; `--old` shows the previous rule failing 15 of 27 holes.

## How a shot works

`physics.simulateShot` plays the whole shot out the moment the putter
connects (fixed 1/120 s step, seeded deflections), and game.js plays the
recording back. Because the future is known, the director can:

- cut to a low, slow-motion **cup cam** ~1.15 s before a drop;
- cut to a **splash cam** before the ball reaches water;
- watch the **tunnel exit** while the ball is underground;
- run an **instant replay** (eagles and better, long birdie putts).

The aim line is the same physics with the dice removed (`physics.predict`),
so it matches the real shot except for sand/ice skates.

Rules worth knowing: water = +1 stroke, ball back to the tee (as the original);
bushes catch the ball at their edge; a ball faster than ~26 px/frame across
the middle of the cup (less at the edge) lips out instead of dropping;
Challenge mode restarts the course if a hole goes over par; a stroke limit
(default 10, a setting) picks the ball up so no hole goes on forever; the
alligator surfaces after ~18 s resting near water and strikes at ~30 s
(+1, back to the tee; can be turned off). Multiplayer: best score on the last
hole tees off first. A replay starts clean: the celebration's confetti and
fireworks run on the game clock and are cleared when it begins.

**The alligator always comes out of the water** (`js/gator.js`). It is a chain
of pieces (head, neck, chest, hips, three bits of tail) that moves along one
track, like a train: back from the ball over the bank, then on through the
pond, bending as the pond bends. The planner tries track directions and
sizes (scale 1.5 down to 0.8) and keeps the first whose whole watch and attack
— checked every 1/50 s against the real mesh outline — never puts a part in
the carpet or the bank, past the rail, or under a bridge. A pond too small to
hide one (the bridge-covered ponds) gets no alligator. Planning runs a few ms
a frame from 14 s, so it never stalls. The attack: surface, rear up with
jaws open, lunge up the bank, snap the ball (the mouth lands on it), shake,
drag it under; the lunge and retreat are paced by their distance.

## Files

| File | What it does |
| --- | --- |
| `js/util.js` | Maths, seeded RNG, storage (`mg2-` prefix), hub manager access |
| `js/course.js` | Course format, lanes → outlines, compiling, hills, **validateHole** |
| `js/physics.js` | Ball physics, `simulateShot`, `predict` |
| `js/gator.js` | The alligator: hiding place, track, poses, checks (pure geometry) |
| `js/art.js` | Themes, procedural textures and models |
| `js/scene.js` | Builds a hole in 3D (game and editor preview); environment |
| `js/fx.js` | Particles, aim ribbon (follows hills), markers, cup glow |
| `js/camera.js` | Camera director (aim, follow, cup cam, orbit, flyover, replay) |
| `js/game.js` | Rules, turns, scoring, shot director, gator, settings, progress |
| `js/ui.js` | Switch input, menus, settings, HUD, scorecard, pause ring |
| `js/audio.js` | SafeAudio + synthesised WAVs (no AudioContext), speech queue |
| `js/editor.js` + `editor.html` | Course Creator |
| `courses/` | Built-in courses + `course_list.json` |

## Course format

Same JSON as the original (1280 × 720 design px, y down), plus optional:
`fairway` (`{lane:[{x,y,w}]}` or `{points}`), `hills`, `bumpers`,
`windmills`, `tunnels`, `name`, `theme`. Old courses load as-is (no fairway =
the whole 1280 × 720 rectangle). Ball radius 12 and cup radius 24 on the
built-in courses.

## Tools (Node only)

- `node tools/build-courses.cjs` — writes the three built-in courses; refuses
  to write a hole that fails `validateHole`.
- `node tools/check-courses.cjs [file …]` — a perfect bot and a "decent
  human" bot play every hole; suggests pars. Run at low priority; ~1 min/course.
- `node tools/check-aim.cjs` — every hole opens facing the right way (and from
  anywhere the ball might stop). Must report 27/27.
- `node tools/check-paths.cjs` — every hole has a clear way to the cup. Must
  report 27/27.
- `node tools/check-gator.cjs [--every N] [--plots DIR]` — plans the alligator
  for ball spots near every pond and plays each attack vertex by vertex on
  the real three.js meshes (in Node — no browser); `--plots` draws top and
  side views as PNGs. Run at low priority; several minutes.

`tools/cdp.cjs`, `smoke.cjs`, `scenario.cjs`, `shoot-holes.cjs` drive the real
game in headless Chrome. **They are off by default** (`MG2_ALLOW_BROWSER=1`
to enable) because software WebGL froze the family PC. Don't run them there.

## Courses

| Course | Theme | Par | Idea |
| --- | --- | --- | --- |
| Sunny Meadows | sunny | 20 | One new thing per hole: dogleg, sand, bumpers, hill, bridge, windmill, boost + ice, tunnel |
| Sunset Lagoon | sunset | 24 | Water: pier bridge, sandbar, shipwreck tunnel shortcut, spiral, mangrove walls |
| Glow Golf Night | night | 24 | Neon arcade: laser gates, ice rink, boost loop, pinball, black-hole bowl, warp tunnels |

## Course Creator

Opened from the game's main menu behind the spoken "Mouse Required" warning
(Cancel first). Registered as editor `narbeminigolf` in `main.js`
(`EDITOR_PATHS`) and `bennyshub/shared/editor_server.py` (`EDITORS`); saves
through `POST /api/narbeminigolf/save-course`, which writes `courses/<name>.json`
and adds it to `course_list.json`. Without the editor server it downloads the
file instead. **Test Play** stores the course as `mg2-testCourse` and opens
`index.html?test=1&hole=N`. The 3D preview is off by default and renders only
on change.

Right-click (without dragging) opens a menu for whatever is under the cursor:
delete, duplicate, copy, turn, resize, remove a fairway point or end, add or
remove a shape's corner, flip a hill into a bowl, and "Add here" / "Move the
tee/cup here" / "Extend the fairway to here" / paste on empty ground.
Right-drag, Space + drag, or the ✋ Hand tool (H) pans; the 3D preview pans
with right-drag or its ✋ toggle. Clicking the plan takes keyboard focus off
any panel field, so Delete and the shortcuts reach the plan.

## Status (2026-10-01)

Verified in a browser before browser testing was stopped: boot, menus with
real keys, flyover, aim, charge, putt, follow cam, cup cam + slow motion,
celebration, replay, scorecard, and a camera-steadiness test (0.0000 units of
movement while aiming).

Changed since, verified only by Node checks and code review:
cup hole cut (was only an 18 % tint), aim ribbon over hills, lip-outs,
reflections limited to shiny things, frame cap / lighter shadows, Choose and
Automatic power, water penalty flow, pause hold, multiplayer turn order,
the two new courses, and the whole Course Creator.

## Shipping

**Live since 2026-10-01** in both copies of the hub:

- OneDrive hub: `apps/games/games.json` entry `narbeminigolf`, thumbnail
  `images/games/narbeminigolf.png`.
- Website copy `bennyshub/`: the game folder (without `tools/` and
  this file), the same thumbnail and the same `games.json` entry. Its
  `index.html` also has the site's `usage-analytics.js` as the first tag in
  `<head>` and the two favicon links after `<title>`; `editor.html` has the
  favicons only (the site's editor convention). **After changing the game
  here, copy it across again and keep those lines** — the F: copy does not
  update itself.

The entry, for reference:

```json
{
  "id": "narbeminigolf",
  "title": "NARBE Mini Golf",
  "description": "3D mini golf you play with one or two switches. Three courses, up to four players, and a Course Creator for making your own.",
  "path": "apps/games/NARBEMINIGOLF/index.html",
  "image": "images/games/narbeminigolf.png",
  "genres": ["Sports", "Simulation"]
}
```

`main.js` changes (the editor registration) take effect after the hub
restarts. The thumbnail is a screenshot of Sunny Meadows hole 6 from 2026-10-01.
