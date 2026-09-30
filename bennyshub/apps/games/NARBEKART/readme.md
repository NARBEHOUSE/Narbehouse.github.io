# NARBE Racer

A local, switch-accessible racing game for Benny's Hub. Open it from the hub's Games library, or serve the **bennyshub** folder over HTTP and visit **apps/games/NARBEKART/index.html**. No game-specific build step, downloads, or internet connection are required.

## Play

- Menus: release Space to move focus; release Enter to choose. Auto Scan lets Enter alone choose. Mouse and touch also work.
- Racing: the vehicle accelerates and follows the road automatically. Hold Space to move left and Enter to move right. An outlined gold ring beneath your vehicle identifies it.
- With Auto Scan enabled, Enter steers in the direction shown on the side panel; releasing changes the armed direction. **Press to Step** in Settings provides steering without a sustained hold.
- Two players: P1 uses Space; P2 uses Enter. Each view shows a coloured ring beneath its controlled vehicle. Side-by-side and top-and-bottom layouts are available.
- Touchscreens: tap across your race view to choose a lane; dragging is optional. Swipe long menus to scroll. Two-player phone views stack in portrait and sit side by side in landscape, while preserving the saved desktop layout.
- Drive through Power Boxes to collect items. Once revealed, each item fires automatically after a random 3–6 seconds; **USE IN** beside the item shows the countdown. Pausing freezes it. Glowing pads give a free boost.
- Ramps lift the vehicle over themed obstacles automatically. Glide ramps open a glider; landing gives a trick boost. Drifts charge automatically too.
- Hold Enter to pause (either player's switch in two-player), press Escape, or use the Pause button. Settings are available from both title and pause.

## Direction Help

Settings → **Direction Help** cycles **Visual → Off → On**. Visual is the default. Cues are compact, steady and explain their purpose: a clear lane around danger, an item box or a boost. Ordinary bends and coin chasing do not produce instructions. On adds occasional hazard calls; two-player games use tones without spoken directions. Off hides guidance. A single compact one-switch steering badge remains visible because it describes what your switch will do.

## Included

Eight tracks across Sunshine and Moonlight cups, twelve racers, four vehicles, fifteen items, No-Fail and Open rules, Grand Prix, Single Race and Time Trial. Cup finishes save trophies and unlocks immediately. Fast Open trophies in both cups unlock Mirror. Time trials save a best time and translucent replay ghost per track and class. Settings and previous choices persist locally.

## Development checks

From the project root:

~~~powershell
powershell -NoProfile -File bennyshub/apps/games/NARBEKART/tools/run-tests.ps1
powershell -NoProfile -File bennyshub/apps/games/NARBEKART/tools/run-tests.ps1 -Suite all
~~~

The runner uses the hub's installed Electron, creates isolated test profiles and keeps test windows hidden. Logs, screenshots and results go into **tmp/nk-tests**. It redirects Electron output and tolerates a closed logging pipe, avoiding the EPIPE popups caused by detached GUI launches.

The automated checks exercise track geometry, every item, physics, complete three-lap races, cup progression, persistence, switch input, pause safety, per-player rings, phone and tablet menu layouts, and touch scrolling. The mobile menu scenario checks portrait and landscape phones, readable touch targets, automatic switch-focus scrolling, and accidental activation during swipes. Mobile checks use Chromium viewport and touch-event simulations; physical iOS and Android devices have not been tested. These do not replace a start-to-finish playtest with the intended player's switch setup or a performance check on the target Surface/tablet.

See **DESIGN.md** for module contracts and **tools/** for focused visual galleries and test scenarios.
