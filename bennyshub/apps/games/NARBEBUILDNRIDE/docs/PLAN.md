# NARBE Build n Ride: plan

Folder `bennyshub/apps/games/NARBEBUILDNRIDE`, next to `NARBEBUILDNBASH`, with the same
shape: classic scripts on one namespace (`window.BNR`), three.js r155 vendored, no Web Audio,
shared hub scanner, voice, graphics and audio modules. It stayed out of `games.json` until the
owner said so, and was listed on 2026-11-17.

## Copied from Build n Bash (adapted, not reinvented)

- `input.js`: the choice-scan bridge (Space steps on release, held Space scans back, Enter
  chooses on release, Auto Scan, blank -1 step, brake and park all come from the shared adapter).
- `ui.js` and `css/style.css`: frosted cards, the main and pause menus, the 3x3 picture grid,
  the settings list, I Need Help and How to Play.
- `settings.js` (game-only settings), `sound.js` (the WAV synthesiser and speech queue),
  `fx.js` (pooled steam, dust and confetti) and `stage.js` (renderer, quality, loop).
- `tools/node_render.cjs`, the harness and jsdom smoke-test pattern, so everything is checked
  in Node with no browser.

## Main systems

| File | Job | Runs in Node |
| --- | --- | --- |
| `js/util.js` | seeded random numbers, smooth noise, maths | yes |
| `js/biomes.js` | biome data: season colours, relief, props, station names, bridge style, ambient sound | yes |
| `js/world.js` | the world: biome mix, ground height, water, track datum (a smooth, gently sloped level the track follows) | yes |
| `js/track.js` | the grid track: pieces relative to the heading, overpass levels, closing the loop, the centre line, tunnel/bridge/ground per stretch | yes |
| `js/routes.js` | the six preset routes as data (a loop of corner cells, plus zones, features and events) | yes |
| `js/path.js` | Connect: A* over (cell, heading, level) back to the start station (step 4) | yes |
| `js/ride.js` | train motion: speed, station stops, events firing (step 2) | yes |
| `js/geo.js`, `js/props.js` | merged low-poly geometry; trees, rocks, houses, animals and people | yes (with three) |
| `js/terrain.js` | chunked terrain, water, instanced scenery, flattened under the track | yes |
| `js/trackview.js` | rails, sleepers, ballast, stone/wooden/steel bridges, tunnel portals and bores, overpass piers, stations | yes |
| `js/train.js` | the toy steam train, wheels, rods, steam, headlight | yes |
| `js/sky.js` | sky, sun, fog; later time of day, seasons and weather | yes |
| `js/scene.js` | puts it all together and steps it (the Node tools render this same scene) | yes |
| `js/cameras.js` | Bird's Eye, Third Person, Conductor; Look with drift back; Comfort Mode | yes |
| `js/stage.js`, `js/sound.js`, `js/input.js`, `js/ui.js`, `js/main.js` | browser side | jsdom |

Key decisions:
- One grid tile is 14 units. A straight is 14 long; a turn is a quarter circle of radius 7.
  Pieces are relative to the heading, so the player never picks a compass direction.
- Track height = the world's datum + an overpass lift. The datum is a smooth function of
  position with a bounded slope, so every loop closes at the same height it started and the
  grade stays gentle. The world adapts: tunnel where the ground is well above the track,
  bridge where it is well below or wet, otherwise the ground is flattened under the track
  and trees in the way are cleared.
- Self-crossing: a piece that enters a cell already holding track goes over it, one level
  (6.75 units: the train fits under the girders) up, and the last few pieces ramp up to meet
  it (a third of a level per piece). Build keeps it sensible (added 2026-11-17 after play):
  at most two levels up (a corkscrew climbs about one and a half turns, then heads out), no
  press that would be too steep or leave nowhere to go, and 500 pieces to lay (a plain count
  down: one a press, Undo gives one back, Connect free; only what is near the camera is built,
  so a big loop costs no more to ride than a small one). A refused press says why and what to
  try; Undo (hold to keep going back) and Connect always work. In free Build buildings in the
  way make way (a puff of dust each); in Quick Build the route's path is clear from the start,
  so nothing ever does. Pieces are counted by press (a Long Straight is one; a Quick Build
  press lays one piece of the design). Zoom stands the Build camera back. A track in progress
  is saved in My Tracks (unfinished: Keep Building); a finished loop can be Edited (opened
  where Connect took over, unfinished until connected again).
- Terrain and track meshes are built per 112-unit chunk (8 tiles), so a big track only
  rebuilds the chunks it touches, and only the chunks near the camera are kept. Scenery is
  instanced per chunk.
- Graphics Quality uses the hub's shared graphics setting (Use Hub setting, High, Standard,
  Low). Standard is the hub's name for Medium; ACCESSIBILITY.md requires the shared resolver.
- Speed changes are spoken and shown. The Ride scan is blank, View, Look, Horn, Speed,
  Pause. Every menu opens with nothing highlighted.

## Build order

1. Core engine: terrain, biomes, grid track, train on the track, three camera views. (built)
2. Ride mode end to end on Countryside: menus, Ride controls, stations, a few events, sounds. (built)
3. Day/night, seasons, weather. (built: `js/weather.js`)
4. Build mode: ghost preview, auto bridges/tunnels/overpasses, Undo, Connect, celebration. (built:
   `js/build.js`, `js/buildview.js`, `js/path.js`)
5. Quick Build. (built)
6. The other five routes, more events, My Tracks (local storage, thumbnails, Ride/Delete). (built:
   `js/tracks.js`; thumbnails are 2D maps of the loop)

The user asked for all of steps 3 to 6 at once (no check-ins), plus: peaceful sound (no hiss),
longer routes escalating in length with ride length on the tiles, people with arms, very
diverse landscapes (16 biomes, climate bands in Build's endless world), deer never run over.

Not in v1 (the data leaves room for them): train styles and colours, more routes and events.

## Testing (Node only)

- `tests/*.test.cjs`: grid, levels, closing, grades, determinism, every route closes.
- `tools/shot.cjs`: CPU-rendered pictures of routes and camera views into `<hub>/tmp/bnr-shots/`.
- `tests/dom-smoke.cjs` (from step 2): whole sessions by Space/Enter in jsdom, two switches and Auto Scan.
