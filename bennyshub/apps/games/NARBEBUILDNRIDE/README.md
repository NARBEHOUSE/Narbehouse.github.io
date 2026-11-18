# NARBE Build n Ride

A switch-accessible toy train game, spun off from NARBE Build n Bash. Ride trains through
low-poly worlds, or build your own loop a piece at a time. No score, no timer and nothing to
lose. Three.js r155, vendored in `vendor/` because the hub runs offline. Listed in
`games.json` on the PC hub and the web hub since 2026-11-17 (the build plan is `docs/PLAN.md`).

## Status

All six v1 steps are built: the engine, Ride, day and night with seasons and weather, Build,
Quick Build, six routes and My Tracks. Everything is checked in Node only (CPU-rendered
pictures and jsdom sessions); it has not been run in a real browser, on real switches or with
real speakers yet.

## Playing

| Screen | Choices (scan order) |
| --- | --- |
| Main menu | Ride, Quick Build, Build, My Tracks, Settings, Exit Game |
| Pick a Ride | 3x3 route pictures ("About 5 min · 5 stations"), More Rides (over 9), Back |
| Ride | View, Look, Horn, Speed (bottom), Pause (top right) |
| Build | Straight, Long Straight, Turn Left, Turn Right, Undo (hold Enter to keep going back), Connect, Zoom, Pause (a piece that can't go down is dimmed; the scan says why) |
| Build, while Connect lays track | Zoom, Pause |
| Build or Quick Build, loop finished | Ride, Zoom, Pause |
| Quick Build: Pick a Design | 3x3 route pictures ("33 pieces · 5 stations": a piece is one press of Build), Back |
| Quick Build | Build (hold Enter to keep building), Zoom, Pause; the bar counts pieces ("12 of 73 pieces") |
| My Tracks | 3x3 map pictures of saved tracks (finished: "About 8 min · 5 stations"; "Unfinished · 40 pieces"), More Tracks (over 9), Back |
| One of My Tracks | Ride, Edit, Delete, Back (an unfinished one: Keep Building, Delete, Back) |
| Delete? / Edit? | Keep It, Delete / Edit |
| Pause | Resume, Settings, I Need Help, How to Play, (Build only) New Track, Main Menu, Exit Game |

Every screen is a stationary choice scan through the hub's shared `NarbeChoiceScanAdapter`
(ACCESSIBILITY.md section 4), copied from Build n Bash: Space steps on release, held Space scans
backward, Enter chooses on release, Auto Scan moves by itself, every screen opens with nothing
highlighted. Pause is always in the scan; Escape and a click or tap on Pause also pause.

**Ride**
- **Horn** (the cause-and-effect button): a three-note steam whistle, a big white puff, the
  headlamp flares, "Toot toot!", the button bounces, and birds near the line take off.
- **Speed**: Slow, Medium, Fast (5, 9, 14 units a second), spoken and remembered. Changes ease.
- **View** cycles Third Person, Conductor and Bird's Eye. In a tunnel Bird's Eye shows the
  train's outline through the hill. **Look** turns and eases back by itself after 6 seconds.
- **Stations**: the train eases in, stands 3 seconds, toots, the name is said and shown and the
  people wave. **Events** fire every lap: deer, sheep, a tractor, balloons, birds and gulls, an
  eagle, a freight train, a whale, sailboats, tumbleweeds, a waterfall's mist, a blimp, fireworks
  (nights) and the northern lights (winter nights). Deer, sheep and the tractor wait at the line
  until the train has gone by. Tumbleweeds (see-through balls of twigs) roll right across with
  the wind; one the train reaches is bumped up and off the line with a puff of dust.
- Under other track (a corkscrew's loop above, an overpass) Third Person rides low and close,
  as in a tunnel, and Bird's Eye shows the train's outline.

**Routes**, each longer and more tangled than the last (lap at Medium): Countryside (4.6 min,
5 stations), Mountain Pass (5.7, 6), Desert Canyon (6.3, 6), Snowy Forest (7.2, 7, starts in
winter), Seaside Cliffs (8.3, 8) and Night City (9.1, 9, starts at night).

**Build**
- The start station (three straights facing east) is fixed; the train waits there.
- Pieces are relative to the way the track is heading. While a piece button is highlighted a
  blue see-through piece shows where it will go; Undo shows red what it would take back;
  Connect shows gold the way home. A white arrow marks the end of the track.
- Pressed pieces drop into place with a click. Bridges, tunnels and overpasses happen by
  themselves ("Bridge!", "Tunnel!", "Over the top!"), and the track may cross over itself.
- Crossings go a level (6.75) up, high enough for the train under the girders, on ramps of a
  third of a level a piece. Nothing ever runs through track: piers, legs and abutments keep
  off other track (over it, a portal frame straddles it), tested with every kind of repeated turn.
- You have 500 pieces: each press uses one (a Long Straight is one piece, three sections long),
  Undo gives one back, and Connect's way home is free. The bar shows "12 of 500 pieces"; a plain
  count down, the same for every button. "Running low on track" warns at 30 left; at none, every
  piece button says "Out of track" (choose Connect).
- A piece is also refused (dimmed; the scan and a press say why and what to try) if it would go
  above two levels ("Too high": a corkscrew of turns climbs about one and a half loops, then
  heads out), need a ramp steeper than a third of a level ("Too steep"), or leave no way on six
  pieces ahead ("No way on", only when another piece leaves more room). Undo and Connect always
  work.
- Zoom stands the camera Close, Far or Very Far (remembered), to see more of the land.
- Track goes anywhere: buildings, trees and rocks in its way make way for it, each building
  with a puff of dust where it stood (Undo brings it back).
- Stations appear by themselves, one per zone, when the track first lays three level straights
  in new country (with room for the station house, and only where a ramp after it still has
  room). Their track never tilts. Anything crossing a station later goes a level and a third
  over it, clear of the canopy and house; bridge legs keep off platforms.
- Undo takes back the last press, never the start station; hold Enter on it and it keeps going
  back, quickly. Connect lays the way home a piece at a time (several together on a long way
  home, so it is always down in about ten seconds; the camera follows), under the ceiling, and
  always succeeds.
- The track in progress is saved in My Tracks as you build (and when you leave): Build on the
  main menu carries on with the latest one; Pause > New Track keeps it there too.
- Among tall buildings the camera hovers over the track just laid (or looks down from above
  the rooftops), never inside or behind a building.
- A finished loop: confetti at every station, a happy tune, the whistle, saved to My Tracks
  ("Meadow Loop", "Desert Loop 2"), then Ride rides it with events chosen for its landscapes.
- A Build in progress waits while you visit the menu; Pause > New Track starts over (asks first).

**Quick Build**: pick a design (one of the six routes). The track is laid up to its first
station, where the train waits; each press of Build lays the next piece of the design, a
stretch of 3 to 5 track sections (hold Enter 3 s and it keeps going, one press a second). A
design's tile and the bar count those pieces, one a press: Countryside 33, Mountain Pass 42,
Desert Canyon 51, Snowy Forest 55, Seaside Cliffs 66, Night City 73. The sections are exactly
the Ride's, so it ends as that route. The ground is ready for the whole route from the start
(as a Ride's is): its path is clear between the buildings, and nothing makes way as it goes down.

**My Tracks**: up to 27 saved tracks, newest first, each with a little map of it over its
landscape (dashed in tunnels, orange on bridges, a star for the start station). A finished loop
can be ridden, or edited: Edit (asks first) opens it where Connect took over, to take pieces
back (hold Enter on Undo) and build on; it is unfinished again until it is connected, then saved
over itself. An unfinished track has Keep Building instead of Ride. Saves keep the player's
presses (record v3), so a track is built again press by press, exactly, Undo and all. A loop saved
before the taller crossings (record v1) comes back with every height scaled up to today's level
(same shape, room for the train under its overpasses).

Settings: Speaking, Voice, Time of Day (Auto Cycle, Morning, Day, Sunset, Night), Season (Auto
Cycle, Spring, Summer, Fall, Winter), Weather (Auto, Clear, Rain, Snow, Fog), Comfort Mode,
Graphics (the hub's shared quality), Highlight Style and Color, Auto Scan, Scan Speed, Sound
Effects, Volume, Train Sounds and Ambient (each Off to Loud).

## Time of day, seasons and weather (`js/weather.js`)

- Auto Cycle runs a day in 10 minutes and holds each season for 4; a held time eases to it.
- Seasons change slowly, weather first: winter starts snowing, then the land whitens in patches
  over about 80 s (40 s when chosen in Settings); spring rains while the snow melts; fall
  brings drifting leaves while the trees turn one by one; summer clears the sky. A locked
  Weather setting is kept. A ride or build loads settled in its season. `tests/seasons.test.cjs`.
- Night: stars, a moon, lit station and house windows, pools of lamplight on platforms, glowing
  coach windows and the train's headlight (also on in tunnels by day).
- Rain and snow fall round the camera (not inside tunnels); fog closes in; the sky clouds over.
  Snow only falls in winter or in snowy country (otherwise it stays cloudy). A rainbow shows
  opposite the sun for a while after rain stops. Seasons repaint the land in 24 small steps,
  a couple of chunks a frame (`terrain.setLook`).
- Events can ask for a mood (`when: { night, season, weather, afterRain }`).

## How the world works

- One grid tile is 14 units. Pieces are relative to the heading: S (straight, 14 long), L and
  R (quarter circles of radius 7). `BNR.Track.fromCorners` turns a loop of corner cells into pieces.
- Track height = the world's **datum** + an overpass **lift**. The datum is smooth and gently
  sloped everywhere, so loops close level. Ground well above the rails becomes a tunnel; well
  below, or water, a bridge; otherwise the ground is flattened under the track.
- **Crossings**: a piece entering a cell holding track it would touch goes a LEVEL (6.75: the
  4.72-tall train under a 1.1-deep girder) up; up to six pieces behind ramp up a STEP (2.25) each,
  never a station's piece or the start, never into track above them. MAX_LIFT is two levels.
  The track lays whatever it is given; Build's check (`js/build.js`) refuses presses as above,
  using `Track.preview(types, { look: 6 })` (ok, reach) for the look-ahead.
- **Buildings** (houses, chalets, adobes, city blocks) are part of the world's map
  (`World.buildingsIn`): fixed lots decided from the seed, the same at every graphics level
  (a lower level keeps some of the same ones). The terrain draws exactly these; trees keep out
  of them. In free Build, any within 3.4 past its size of track (or on a station's ground) makes
  way, with a puff of dust (`Build.clearedBy`); trees and rocks make way too, as on a real
  railway. A Ride's and Quick Build's ground is ready for the whole route, so none ever do.
- **Connect** (`js/path.js`): weighted A* over (cell, heading, lift) using the track's own rules,
  preferring long straights (turns cost extra). Build keeps the cells behind the start as the
  way home (crossings there stay high), so a way home always exists; walled in, it rewinds.
- **The endless Build world**: regions on a jittered grid; a slow climate field picks cold, mild
  or hot country, so all 16 landscapes appear and snow almost never meets desert. Build starts
  in a meadow.
- Terrain, track and scenery are built per 112-unit chunk. In Build, only the chunks a change
  touches are redrawn (the track's partial redraw is tested to match a full one).
- In the game only what is near the camera is built: land and track chunks within sight
  (`Terrain.update`, `TrackView.update`, far ones let go and rebuilt the same when the train
  comes round), stations drawn only near it, and the world's caches capped. So a long loop costs
  no more to ride than a short one: all 500 pieces (1400 sections, a 38-minute lap, in testing)
  hold about what Countryside does (tests/scale.test.cjs); the longest possible (every piece a
  Long Straight, straight out and home: about 3000 sections, 78 minutes) rides in 43 MB.

## Files

| File | What it holds |
| --- | --- |
| `js/util.js` | Seeded random numbers, smooth noise, maths |
| `js/biomes.js` | 16 landscapes as data: season colours, relief, props, station names, bridge style, ambience |
| `js/world.js` | Biome mix, ground height, water, datum, ground colour; routes or the endless world |
| `js/track.js` | The grid track: pieces, lifts and ramps, undo, preview, restore, closing, centre line, structure, ground shaping, station sites |
| `js/routes.js` | The six routes as data; `facts(id)` (lap minutes, stations, pieces) for the tiles |
| `js/path.js` | Connect: the way home (`connect`, step by step `closeSteps`, `close`) |
| `js/build.js` | Build and Quick Build logic: sessions, stations, saving, events for home-made loops |
| `js/tracks.js` | My Tracks: storage, names, map pictures |
| `js/geo.js`, `js/animals.js`, `js/props.js` | Merged low-poly geometry; animals; trees, rocks, houses, landmarks |
| `js/terrain.js` | Chunked terrain, water and instanced scenery |
| `js/trackview.js` | Rails, sleepers, ballast, bridges, ramps, girders, tunnel portals and bores |
| `js/train.js` | The toy steam train, headlight, freight cars, x-ray outline, lamp flare |
| `js/stations.js` | Platforms, canopies, houses by biome, lamps and windows that light at night, signs, waving people |
| `js/ride.js` | The ride: speeds, braking into stations, the 3 s stop, events per lap |
| `js/sky.js`, `js/weather.js` | Sky, sun, moon, stars, rainbow, fog, clouds; the time, season and weather cycles |
| `js/fx.js`, `js/events.js`, `js/buildview.js` | Particles and steam; things along the ride; the Build previews and drops |
| `js/scene.js`, `js/cameras.js` | The world, track and train stepped headless (Ride and Build); the ride cameras |
| `js/stage.js`, `js/settings.js`, `js/sound.js`, `js/input.js`, `js/ui.js`, `js/main.js` | Browser side |

Sound is synthesised into WAVs and played through `<audio>` elements, never Web Audio: one-shots
through SafeAudio, loops (ambience by landscape, rain, the tunnel rumble) through two elements
per loop that crossfade. Everything is tonal and soft: no noise beds (the sound test checks).
The ambience is soft background music for each kind of land (24 s loops of slow chords with a
few mallet or flute notes), all on the C major pentatonic so zones blend without clashing, and
kept under 1.2 kHz: no chirps or squeaks (user feedback 2026-11-18).

## Tests (Node only: never a browser on the development PC)

```
node tests/track.test.cjs          pieces, closing, crossings and ramps, undo, preview, grades,
                                   determinism, every route closes with a tunnel, a bridge and stations
node tests/path.test.cjs [n]       Connect closes hundreds of random tangles; the way home stays clear
node tests/build.test.cjs [n]      Build sessions, stations, saving, events for home-made loops,
                                   Quick Build = the Ride's track, partial redraw = full, My Tracks,
                                   every landscape in the endless world
node tests/routes.test.cjs         the six routes: length, escalation, stations apart, events, nothing run over
                                   (tumbleweeds bumped, never run through)
node tests/clearance.test.cjs [n]  corkscrews, U-turns, zigzags, spirals and random builds: no track
                                   through track, no support on track, ceiling, ramps, no dead ends,
                                   the track budget, old saves scaled; the routes too
node tests/buildings.test.cjs [n]  the world's buildings are fixed and drawn exactly; free Build
                                   clears those in its way (one puff each); Quick Build = the
                                   Ride's buildings, none make way
node tests/scale.test.cjs          a loop of all the pieces Build allows, built and ridden round with the camera
                                   set: it holds about what a short ride does; streamed track = full
node tests/ride.test.cjs           the ride controller and whole laps of every route through the real scene
node tests/sound.test.cjs          every sound renders, soft and peaceful; every name the game plays exists
JSDOM=<dir>/node_modules/jsdom node tests/dom-smoke.cjs
                                   whole sessions by Space/Enter in jsdom (two switches and Auto Scan):
                                   Ride, Settings, Build with Connect, My Tracks delete, Quick Build
node tools/shot.cjs map|views|looks|tour|train|station|events|thumb|animals <route> [--at s]
                                   CPU-rendered pictures into <hub>/tmp/bnr-shots/
node tools/shot.cjs hero           the hub picture; python tools/hub-image.py adds the title
node tools/route-pictures.cjs <page url>
                                   the route tiles' pictures into images/routes/ (Edge on the GPU, through
                                   Playwright); then bump ROUTE_PICTURES in js/main.js
```

`tools/harness.cjs` boots the real modules in Node; `tools/node_render.cjs` is Build n Bash's
CPU rasteriser with per-instance colours added. The jsdom test pads longer timers: Node counts
timers from its event loop's cached clock, so after a busy frame a timer can fire a few ms early
by `Date.now()`, and the shared scanner's Auto Scan then stalls. Browsers are not affected.
