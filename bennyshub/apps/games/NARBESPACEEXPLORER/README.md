# NARBE Space Explorer

A calm, switch-accessible space exploration game, built from `SPACEEXPLORER.md` (the design doc).
You stay in your spaceship and explore a near-infinite, seeded universe of galaxies, star systems,
planets and moons. No combat, no score, no timer and nothing to lose. Three.js r155, vendored in
`vendor/` because the hub runs offline. Listed in both hubs' `games.json` (id `narbespaceexplorer`,
picture `images/games/narbespaceexplorer.png`) and on the website's home page since 2026-11-20.

## Status

All five steps of the doc's "First Version Scope" are built: one galaxy (and then endless more)
with seeded systems, flying and the go-here prompt; every planet type plus gas giants, moons and
names; orbit, Fly Low and the cockpit views; the logbook; creatures, civilisations and warping.
Everything is checked in Node only (unit tests, CPU-rendered pictures and jsdom sessions through
the real page and the hub's shared scanner). It has **not** been run in a real browser, on a real
GPU, on real switches or with real speakers yet.

## Playing

| Screen | Choices (scan order; every screen opens with nothing highlighted) |
| --- | --- |
| Main menu | Start / Keep Exploring, Logbook, How to Play, Settings, Exit Game |
| Flying | Next Stop, Explore System (Nearby Stars in deep space), Warp, Steer, Pause (top right) |
| Steer | Turn Left, Turn Right, Up, Down, Speed (cycles Very Slow to Very Fast), Back |
| Explore System / Nearby Stars | (no card: a shot from high over the system) the star and each planet, highlighted where it is (or the 6 nearest systems), Back |
| Gliding (by itself) | Pause |
| Do you want to go here? | Yes, No (the ship slows to a crawl until answered) |
| Orbit | Fly Low, Scan, Visit a Moon (or Visit <moon> / Back to <planet>, only when there is one), Leave Orbit, Pause |
| Visit a Moon (2+ moons) | each moon, Back |
| Fly Low | Scan, Turn Left, Turn Right, Back to Orbit, Pause |
| Scanner | Next Creature (2+ kinds), Back |
| Alien call | Wave Hello, Say Goodbye |
| Galaxy map | Warp to a New Star, Warp to a New Galaxy, Back |
| A new galaxy (seen from outside) | Fly In, Find Another Galaxy |
| Pause | Continue, View (Chase / Wide / Cockpit; Chase first), Logbook, Settings, How to Play, I Need Help, Main Menu, Exit Game |
| Logbook | 3x3 picture pages, More Pages, Field Guide, Back; an entry: Next, Previous, Visit Again, Back |
| Field Guide | Worlds, Landscapes, Stars, Animals, Plants, Civilisations, Rare Sights (each with how many found), Back; a section: 3x3 pages of finds (silhouettes with a hint until found), More Pages, Back; a find: Visit Again, Back |
| Settings | Text to Speech, Voice, Flight Speed, Alien Calls, Spoken Facts, Motion, Graphics, Highlight Style, Highlight Color, Auto Scan, Scan Speed, Sound Effects, Volume, Music, Reset Logbook (two steps; erases the Field Guide too), Back |

- **Flying**: the ship flies forward by itself. Each steering press turns 30 degrees (up/down 20)
  smoothly. Far from anything it speeds up a lot (an accelerated, not-to-scale pace) and eases back
  near stars and planets so the prompt comes in good time. It never flies through anything.
- **The scans are kept short** (the user: "there's a lot to scan to for someone with just 1 or 2
  buttons"): steering lives behind Steer, View in the Pause menu, and each bar has 4-5 stops.
- **Next Stop** (not in the doc, added so steering is optional): turns toward the nearest place
  not visited yet; a ring on screen marks it.
- **Explore System** (the user's idea, then "instead of a menu that pops up, a shot over the solar
  system, and each planet highlights as you scan to it"): no card. The camera rises up and over the
  whole system (2.3 s, 2.8 s with Motion: Calm) to a framed three-quarter shot; each world gets a
  ring in the picture (a page button over the 3D view) that lights up in the hub's highlight colour
  and style where the world is, with its name as a big label; a small panel at the bottom says what
  it is (type, moons, People / Life / Visited) beside Back. Choose one and the camera comes back
  down to the ship as it flies there and into orbit by itself. In deep space it is **Nearby
  Stars**: the same shot over the 6 nearest systems round the ship; choose one, glide over (faint
  speed lines), and the camera rises over that system on arrival. The ship holds still meanwhile.
  - The shot is framed (`js/stage.js` fitSurvey) between the title box and the panel, at a low angle
    (wide screens), aimed so the system sits in the middle; no lift on this screen.
  - From up there worlds would be specks and inner ones huddle round the star, so the orbits spread
    out a little like a diagram (`Universe.surveySpread`: 80% of the way to even rings) and each
    planet is drawn up to 8 times bigger (`Universe.surveyLayout`), never touching a neighbour, the
    star or the ship, even while sliding back; moons and space stations tuck away; orbit lines
    brighten. Everything slides back as the camera comes down (glides into orbit take at least
    3.2 s, so the planet is home before you arrive).
  - A name that would land on another ring or name hides until its world is highlighted; "You"
    marks the ship (hidden if it would sit behind the panel).
- **Prompt**: a chime, "A planet! Velara, an ocean world. Do you want to go here?". No = not asked
  about it again until you have flown well away.
- **Orbit**: a smooth glide in; the name, type and facts (gravity, moons, day length, weather,
  rings, life, people) are spoken (Settings > Spoken Facts) and it goes into the logbook with a
  picture taken once the planet's maps are painted.
- **Views**: Chase (the default since 2026-11-23: the user said it "seems to look the best"; saved
  settings switch to it unless View was picked by hand, `viewChosen`), Wide, and Cockpit (a light
  canopy drawn by the page: thin top rim, two slim corner struts, a low console only where the button
  bar is, a faint tint at the glass's edges; also shown in Fly Low and on the way down and up). Changes
  glide, never cut; a glide that follows the ship keeps aiming between the two views' aim points, so the
  ship never swings out of the picture.
- **Orbit framing** (`js/stage.js` orbitChasePose / orbitCockpitPose): the world sits whole in the open
  part of the picture above the button bar (the user: the buttons "completely block the planet").
  Chase looks down past the ship from behind and above, the ship just over the world's top edge;
  Cockpit tips the nose down at the world; Wide is the sightseeing shot. The ship is drawn up to 1.7
  times bigger beside big or ringed giants, and the camera stays far enough back beside small moons.
  Orbit lines and space dust fade out in orbit and in the dive (the ship sits on its planet's own orbit
  line, which cut straight up the picture).
- **Fly Low** (`js/surface.js`): the ship dives down from orbit with the camera close behind it the whole
  way (nose level at first, tipping down, levelling over the cloud tops; the camera keeps the world's edge
  in the picture), through a soft fade in the sky's colour (darker with Motion: Calm; never a flash), then
  dives on out of the sky through the cloud layer, the camera riding with it (`setIntro`), and levels out to
  an endless calm skim over the world, different for every type
  (ice spires, ocean islands, earth hills and lakes, desert mesas, lava rivers, crystal fields,
  toxic mushrooms, gas-giant cloud tops, cratered moons with the planet in the sky), with that
  world's creatures wandering and, on inhabited worlds, towers, domes and passing saucers. Turn Left
  and Turn Right steer it (one press, one smooth turn). Back to Orbit climbs out the same way, nose up.
  No speed lines or streaming dust on the way down or up (the user saw "stars go by" inside the air).
  Plants are named when there are any ("Trees and bushes grow here, but no creatures were found").
- **Scan**: a viewer window shows each thing turning slowly: the people first (on an inhabited
  world), a golden creature or gentle giant next, then every animal (name, size, how it moves, a
  silly fact, its sound), then every kind of plant; or the world, or the star (a black hole with
  its disk, both stars of a pair, a star in its nebula) and its facts. Everything that can be
  scanned shows a picture (the user: "this can't happen"); creatures and plants are framed by
  their own shape. Animals and plants go in the Field Guide, creatures in the logbook.
- **Planets from orbit** (`js/planets.js`, 2026-11-23): continents with crinkled coasts, mountain
  spines, rivers and biomes from each world's palette; deep oceans, lighter shelves, atolls, a
  second sea tint, sea ice; lava plates, crystal facets, dune seas, crater fields with rays; banded
  gas giants with eddies and storms; swirling cloud systems; a real day/night edge with a thin
  atmosphere rim; ringlets with the planet's shadow; a relief (normal) map and a sun glint on seas.
  Inhabited worlds show city sprawl, roads and fields by day and lights tracing the coasts at night.
- **Living worlds in Fly Low** (`js/surface.js`, `js/creatures.js`, `js/flora.js`): herds, flocks
  and schools (leaders are full models, the rest cheap instanced copies), sea creatures (fish,
  dolphins, whales, turtles, sea noodles) on worlds with seas, and 35 kinds of plant placed by
  habitat (kelp and coral in the sea, lilies on ponds, floating plants on gas giants), with
  turquoise shallows and foam along the coasts.
- **Civilisations** (rare since 2026-11-23, about one star system in eight to ten, and grand): each
  builds in its own style (glass towers, great glowing domes, terraced mountain-cities, floating
  islands or cloud platforms, tree-cities, crystal prisms) and has technology to see: floating
  trains between cities, drones, sky ships, light beacons, solar farms, patchwork farms, a space
  elevator and an orbital ring (in the sky in Fly Low, and round the planet in orbit with stations
  and shuttles; orbit framing takes the ring in). Ships in the people's style fly up to meet you;
  arrival names the style and technology (`NSE.Universe.civWords`), and Scan shows the people
  first. Sometimes one of them calls (friendly, curious, grumpy or loud) with a cartoon face,
  gibberish and a translation.
- **Warp**: one big press. Lines of light, a deep whoosh, no flash, and you come out at a new star.
  Warping to a new galaxy shows the whole galaxy from outside first (`js/galaxyview.js`), then asks
  "Do you want to fly in and explore?": Fly In turns to one of its arms, speeds down into it and comes
  out among its stars the way a warp does (the lines of light easing off). **Visit Again** in the logbook warps straight back and into orbit.
- While the button bar shows, the picture is lifted (an off-centre lens) so the middle of the view
  sits above the buttons, and the prompt card sits low where the bar was (the user: buttons were
  covering things).
- Where you are is saved every few seconds and on leaving; Keep Exploring carries on from there.

## Decisions that differ from the design doc (hub rules win)

- **Sound uses no Web Audio.** The doc asks for the Web Audio API; ACCESSIBILITY.md section 5 forbids it
  (an AudioContext can take down the Electron renderer). Everything is synthesised in JS into WAVs
  and played through SafeAudio / plain `<audio>` (`js/sound.js`, from Build n Ride).
- **Key remapping is left out.** The hub contract is two keys, Space and Enter, with a shared
  input guard and sensitivity filter (ACCESSIBILITY.md sections 2 and 4); switch interfaces are set up on
  their own hardware. Remapping would bypass the guard.
- **Pause is always a scan choice; no hold gestures anywhere** (section 12's direction, and many
  players cannot rely on taps or timed holds).
- **Auto Scan, Scan Speed, Text to Speech and Voice** are the hub's shared managers, also in the
  game's own Settings (games are played outside the hub too).
- **Next Stop**, **Spoken Facts**, **Alien Calls** and **Motion** settings were added.

## Replayability: the Field Guide and rare sights (2026-11-23)

The user asked for the game to feel replayable, then for "a ton of different animals and plants to
identify" and rare, grand civilisations. So:

- **Field Guide** (`js/fieldguide.js`, Logbook > Field Guide): a collection book of every kind of
  world (9), landscape (32), star (8), animal (`NSE.Creatures.KINDS`), plant (`NSE.Flora.KINDS`),
  civilisation style and technology (14) and rare sight (10). Things not found yet show as
  silhouettes (animals and plants: the model drawn flat, `NSE.Stage.portrait`) with a hint where to
  look. Worlds, landscapes, civilisations and world rare sights are found by going into orbit, stars
  by flying into the system, animals and plants by scanning them (the scanner now lists plants after
  the animals), Fly Low sights by seeing them. Each find remembers where it was (Visit Again) and a
  picture (the logbook photo, a portrait, or a coloured planet or star). Every species scanned is
  counted ("37 animals identified"). New finds get a callout, a small bell ('find') and a line in
  the arrival or scanner speech; rare ones a bigger shimmer ('rare') and their own line.
- **Rare sights** (each from its own random stream, so nothing else about a place changes):
  a **comet** sweeping round its star with a blue ion tail and a curved dust tail pointing away from
  the star, and a pod of **star whales** that swim up beside the ship a while after it flies into
  their system, singing ('whale'), then swim on (`js/sights.js`; about 8% and 5% of systems, whales
  30% inside nebulae); **rainbow giants**, **double rings**, **glowing seas**, **auroras** and
  **ringed moons** (drawn in `js/planets.js`); a **rainbow** in the sky, a **golden creature** and a
  **gentle giant** in Fly Low. A rare world says so in the prompt, Explore System's tags and its
  facts.
- **More life**: 4-8 kinds of animal on a living planet (2-4 on gas giants and moons), more worlds
  with life, and kinds of plant on most worlds (`w.flora`; `NSE.Universe.plants` words follow it).
- **Civilisations are rare** (about 1 star system in 8-10; `CIV_RATE`) and grander: each builds in a
  style (`civ.style`: glass towers, domes, mountain-cities, floating, tree-cities, crystal) with
  technology (`civ.tech`: orbital ring, space elevator, floating trains, drones, sky ships, beacons,
  solar farms, patchwork farms), named on arrival (`NSE.Universe.civWords`).

## How the universe works (`js/universe.js`, headless)

- Space is sector cubes of 6000 units; most hold one system, jittered, and no system reaches
  past 2480 units from its star, so neighbours never overlap. Density thins above and below the
  galaxy's disk but never runs out. A galaxy seed plus a sector key decides everything.
- System kinds: yellow, orange, red, blue, white, binary, a star in a nebula, black hole.
- Planet types: ice, ocean, earth-like, desert, lava, crystal, toxic, gas giant (moons may also be
  rocky). Each world's palette, terrain, sea level, clouds, atmosphere, rings, tilt, spin, gravity,
  day length, temperature, moons, life (1-4 species) and civilisation come from its seed.
- Everything is spaced by its "reach" (moon orbits plus the ship's orbit), so orbiting one thing
  never passes through another.
- Variety: every world also gets a terrain style (ice: spires, glaciers, cracked, snowfields; ocean:
  islands, archipelago, reefs, open; earth: forest, meadow, mountains, lakes, jungle; desert: dunes,
  mesas, canyons, salt; lava: rivers, volcanoes, cracked; crystal: shards, geodes, forest; toxic:
  mushrooms, swamp, bubbles; gas: bands, storms, calm; rock: craters, boulders, canyons) and a
  seeded colour shift (wide for gas giants and crystal worlds), from a separate random stream so
  names, sizes, moons and places never change. `Universe.plants(world)` says what grows.
- Names join 2-3 syllables; moons are "Velara II". A word filter re-draws any name (or alien
  gibberish word) that would spell something rude.

## Files

| File | What it holds |
| --- | --- |
| `js/util.js` | Seeded random numbers, 3D noise, maths, colours |
| `js/universe.js` | Galaxies, sectors, systems, stars, planets, moons, names, facts (headless) |
| `js/flight.js` | The ship's flight, steering, Next Stop, discovery, glides, orbits (headless) |
| `js/planets.js` | Planet/moon/star/black hole/nebula meshes; maps painted a few rows a frame |
| `js/ship.js` | The player's ship |
| `js/galaxyview.js` | A whole galaxy seen from outside, after a warp; the dive in |
| `js/space.js` | The space scene: galaxy sky, background stars, nearby systems, dust, warp lines, welcome ships |
| `js/sights.js` | Rare sights in space: comets and star whales |
| `js/surface.js` | Fly Low worlds |
| `js/creatures.js` | Creatures built from parts, their words and animation; `KINDS` for the Field Guide |
| `js/flora.js` | Plants: kinds, specs, words and models (the scanner and Fly Low); `KINDS` for the Field Guide |
| `js/aliens.js` | Alien faces (2D canvas), gibberish, moods |
| `js/logbook.js` | The logbook (localStorage, small JPEG pictures, oldest pictures dropped first when full) |
| `js/fieldguide.js` | The Field Guide: everything there is to find, what has been found and where (localStorage) |
| `js/sound.js`, `js/voice.js` | Synthesised sound and music; the speech queue |
| `js/stage.js` | Renderer, graphics quality, cameras and views, scanner viewer, snapshots, render loop |
| `js/settings.js`, `js/input.js`, `js/ui.js`, `js/main.js` | Game settings, switch input, the page, the game |

## Tests (Node only: never a browser on the development PC)

```
node tests/flight.test.cjs       universe determinism, clean names, spacing, and whole journeys:
                                 prompt, No, Next Stop, orbit, moon, leave, steering, never inside anything;
                                 Explore's shot over 500+ systems: bigger worlds never touch, even mid-slide
node tests/creatures.test.cjs    creature specs and models (determinism, friendliness, animation)
node tests/surface.test.cjs      every Fly Low world type for a simulated minute
node tests/sound.test.cjs        every sound renders, soft and peaceful; every name the game plays exists
node tests/fieldguide.test.cjs   the guide lists exactly what the universe makes; finds, species, reload, clear;
                                 rare sights, life, plants and civilisations: deterministic, as often as intended
JSDOM=<dir>/node_modules/jsdom node tests/dom-smoke.cjs
                                 whole sessions by Space/Enter through the real page (two switches,
                                 then Auto Scan): every screen above, settings, logbook, exit to hub
node tools/galaxy-shot.cjs <png> 90210 --dist=720
                                 the hub picture (images/games/narbespaceexplorer.png, since 2026-11-20):
                                 the galaxy view (the Phatorbel Galaxy, seed 90210) mid-reveal, drawn in Node
                                 the way WebGL draws its points and glow sprites; several seeds = a contact sheet
JSDOM=... node tools/explore-shot.cjs <dir> [highlight] [min planets] [stars]
python tools/explore-overlay.py <dir>
                                 a mock-up of Explore System's shot (real game in jsdom, real camera and rings)
node tools/hero.cjs <png>        the old hub picture (ship and planets); python tools/hub-image.py adds a title
```

`tools/hero.cjs` and `tools/explore-shot.cjs` use NARBE Build n Ride's CPU renderer
(`../NARBEBUILDNRIDE/tools/node_render.cjs`), which has no point lights, sprites, lines or custom
shaders, so their pictures are only a rough check (explore-shot dots the orbit lines and lights the
worlds from the camera's side; the overlay draws the star's glow and the page with stand-in fonts).
