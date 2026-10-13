# NARBE Racer

A local, switch-accessible racing game for Benny's Hub. Open it from the hub's Games library, or serve the **bennyshub** folder over HTTP and visit **apps/games/NARBEKART/index.html**. No game-specific build step, downloads, or internet connection are required.

## Play

- Menus: release Space to move focus; release Enter to choose. Auto Scan lets Enter alone choose. Mouse and touch also work.
- Racing: the vehicle accelerates and follows the road automatically. Hold Space to move left and Enter to move right. An outlined gold ring beneath your vehicle identifies it.
- With Auto Scan enabled, Enter steers in the direction shown on the side panel; releasing changes the armed direction. **Press to Step** in Settings provides steering without a sustained hold.
- Two players: P1 uses Space; P2 uses Enter. Each view shows a coloured ring beneath its controlled vehicle. Side-by-side and top-and-bottom layouts are available.
- Touchscreens: tap across your race view to choose a lane; dragging is optional. Swipe long menus to scroll. Two-player phone views stack in portrait and sit side by side in landscape, while preserving the saved desktop layout.
- Drive through Power Boxes to collect items. Once revealed, each item fires automatically after a random 3–6 seconds; **USE IN** beside the item shows the countdown. Pausing freezes it. Glowing pads give a free boost.
- Every track has a big full-width jump over its own landscape: a brook, a sea inlet, a chocolate river canyon, a red rock canyon, a glacier crevasse, a bog ravine, a lava moat, a gap in space, a jungle gorge, and the sky between floating islands. Every vehicle launches automatically, whatever its lane. Glide ramps open a glider; landing gives a trick boost. Drifts charge automatically too.
- The Wonder Cup adds loop-de-loops (the camera rolls round with you), steeply banked berms, a waterfall to drive through and floating islands linked by castle bridges.
- Hold Enter to pause (either player's switch in two-player), press Escape, or use the Pause button. Settings are available from both title and pause.

## Direction Help

Settings → **Direction Help** cycles **Visual → Off → On**. Visual is the default. Cues are compact, steady and explain their purpose: a clear lane around danger, an item box or a boost. Ordinary bends and coin chasing do not produce instructions. On adds occasional hazard calls; two-player games use tones without spoken directions. Off hides guidance. A single compact one-switch steering badge remains visible because it describes what your switch will do.

## Included

Sixteen tracks across the Sunshine, Moonlight, Wonder and Dream cups, twelve racers, four vehicles, fifteen items, No-Fail and Open rules, Grand Prix, Single Race and Time Trial. Coins sit in trails that hop between lanes; the coins a player holds at a Power Box improve the item they get (more so the further behind they are) and are spent on it. Cup finishes save trophies and unlocks immediately; each cup opens the next. Fast Open trophies in the Sunshine and Moonlight cups unlock Mirror. Time trials save a best time and translucent replay ghost per track and class. Settings and previous choices persist locally.

## Development checks

From the project root:

~~~powershell
powershell -NoProfile -File bennyshub/apps/games/NARBEKART/tools/run-tests.ps1
powershell -NoProfile -File bennyshub/apps/games/NARBEKART/tools/run-tests.ps1 -Suite all
~~~

The runner uses the hub's installed Electron, creates isolated test profiles and keeps test windows hidden. Logs, screenshots and results go into **tmp/nk-tests**. It redirects Electron output and tolerates a closed logging pipe, avoiding the EPIPE popups caused by detached GUI launches.

The automated checks exercise track geometry, every item, physics, complete three-lap races, cup progression, persistence, switch input, pause safety, per-player rings, phone and tablet menu layouts, and touch scrolling. The mobile menu scenario checks portrait and landscape phones, readable touch targets, automatic switch-focus scrolling, and accidental activation during swipes. Mobile checks use Chromium viewport and touch-event simulations; physical iOS and Android devices have not been tested. These do not replace a start-to-finish playtest with the intended player's switch setup or a performance check on the target Surface/tablet.

### Node-only checks (no browser, no GPU)

These run the shipping game code in plain Node and are safe on any machine:

~~~powershell
node bennyshub/apps/games/NARBEKART/tools/validate_tracks.js      # every layout rule, mirrored too
node bennyshub/apps/games/NARBEKART/tools/jump_layout_test.cjs    # jumps, landscape gaps, loops, falls, islands, berms
node bennyshub/apps/games/NARBEKART/tools/setpiece_test.cjs       # full races on the real worlds: gaps, loops, camera
node bennyshub/apps/games/NARBEKART/tools/race_test.cjs
node bennyshub/apps/games/NARBEKART/tools/items_ai_test.cjs
node bennyshub/apps/games/NARBEKART/tools/audio_check.js
~~~

**tools/node_render.cjs** draws the real scene on the CPU and writes PNGs: `node tools/node_render.cjs track jungle --at 0.2` renders a chase view at a lap fraction; `node tools/node_render.cjs props temple_big,sky_whale` renders a prop sheet. It approximates lighting per triangle and skips shader effects, so treat it as a layout and composition check, not a pixel-exact preview.

See **DESIGN.md** for module contracts and **tools/** for focused visual galleries and test scenarios.
