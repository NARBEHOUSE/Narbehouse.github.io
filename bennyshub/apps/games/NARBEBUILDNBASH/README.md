# NARBE Build n Bash

A switch-accessible cause-and-effect game. Each **Build** press puts the next
wooden toy block in place until a house, a train, a castle or a space station
stands finished. **Destroy**, at any time (even halfway), sends something silly
to knock it down: a kid's arm, a giant leg, an explosion, a wrecking ball, a
little truck, a bowling ball, a T. rex's tail, a tornado, a meteor or a big
sneeze, picked at random. When it is all down: **Build Again** or **Pick Another**.
No score, no timer and nothing to lose.

Three.js r155 and ammo.js (Bullet physics, the same build as Benny's Ballista),
both vendored in `vendor/` because the hub runs offline.

## Playing

| Screen | Choices (scan order) |
| --- | --- |
| Main menu | Build, Settings, Exit Game |
| Build Select | 3x3 picture tiles over two pages (smallest build first), More/First Builds, Back |
| Play | Build (bottom left), Destroy (bottom right), Pause (top right) |
| All knocked down | Build Again, Pick Another |
| Pause | Continue, Start Over, Pick Another, I Need Help, Settings, How to Play, Main Menu, Exit Game |

Every screen is a stationary choice scan through the hub's shared
`NarbeChoiceScanAdapter` (ACCESSIBILITY.md section 4): Space steps on release,
held Space scans backward, Enter chooses on release, Auto Scan moves by itself.
Every screen opens with nothing highlighted. In play, **Pause is always a scan
choice**, and there is no hold-to-pause. Escape and a click or tap on Pause also pause.

**Hold to Build** (Settings, on by default; added 2026-11-07 because Ben builds
with head turns and a big build took many of them): a press on Build still
places one block, on release. Holding Enter on Build for 3 seconds places a
block, then one more every second until the build is finished or the switch
comes up. The release after a hold that built adds nothing, so it can never
choose Destroy when Build leaves the scan at the last block. A yellow bar fills
along the bottom of Build during the 3 seconds, then refills once per block.
Pressing and holding Build with a mouse or finger does the same. Off: every
press is one block, however long it is held. Timings: `HOLD_START` and
`HOLD_EVERY` in `js/input.js`.

- Build disappears the moment the last block is chosen, and stays away once
  knocking down has begun; Destroy is dimmed (and skipped) until the first block.
- Destroy chosen while a destroyer is still running queues the next chunk.
- Big builds come down in chunks (about one press per 15 blocks: Huge builds
  take 4); the pips on the Destroy button show the presses left. Settings, Big
  Builds Fall: All at Once makes every build one press.
- Speech: scan labels; special pieces as they land ("Door", "Roof"; Piece Names
  setting); "You built the Castle!"; each destroyer's line ("Wrecking ball!");
  "All knocked down!". Event lines queue behind each other and scanning
  interrupts them.

Settings: Speaking, Voice, Hold to Build, Piece Names, Big Builds Fall, Next Block Hint (a
glowing outline where the next block goes while Build is highlighted), Motion
(Full / Calm: no shake, steadier camera, fewer effects), Graphics (the hub's
shared quality), Highlight Style and Color, Auto Scan, Scan Speed, Sound
Effects, Volume, Reset Progress (two-step). Progress = a check mark on each
build you have finished (`bnb-progress-v1`); settings are `bnb-settings-v1`.

## Files

| File | What it holds |
| --- | --- |
| `js/shapes.js` | The block set: shapes, bevelled geometry, paint and patterns, collision shapes, point tests |
| `js/builds.js` | The 12 builds as data (one block per press) and the build checker |
| `js/chunks.js` | How a build comes down in chunks (slices from one side, plus what rests on them) |
| `js/worlds.js` | The world kit and 9 worlds: neighborhood, barge (at sea), hill, countryside, desert, canyon (a real river), planet (red alien planet, low gravity), cove, city |
| `js/worlds2.js` | kingdom, boardwalk (sunset seaside), space (zero gravity) |
| `js/bashers.js` | The 10 destroyers and their shared helpers |
| `js/physics.js` | Ammo adapter: frozen (kinematic) blocks until knocked, then dynamic |
| `js/fx.js` | Pooled particles: dust, smoke, sparks, fire, splash, confetti, rings |
| `js/sim.js` | One build in one world: placement, destruction, events. Headless |
| `js/stage.js` | WebGL renderer, camera director, Build Select pictures |
| `js/sound.js` | Synthesised WAV effects through SafeAudio (no Web Audio) and the speech queue |
| `js/settings.js`, `js/input.js`, `js/ui.js`, `js/main.js` | Settings, switch input, screens, game flow |

Blocks that are standing are **frozen**: kinematic bodies that never need to
balance, so any design stands exactly as built. A destroyer loosens its chunk
(dynamic bodies, real tumbling); the rest stays frozen until its turn.

Decisions worth knowing:
- **Every build has its own world**, and the camera sits low (11 degrees, the
  build a little below centre: `Sim.VIEW_SHIFT_Y`) so each world's sky and
  skyline show. The user asked for unique, interesting backgrounds per level.
- **The Pyramid is smooth and Egyptian**: four corner pyramids, four
  tetrahedra (shape `tet`), an upside-down middle and a gold capstone, so every
  face is flat and made of triangles, on a 5-piece platform (15 presses).
- **The Bridge spans a real river** (canyon world: bank and riverbed ground
  boxes, water below the banks). The **Robot** stands on a red alien planet
  (gravity 11); the **Space Station** floats in zero gravity.
- **Spin groups** (`build.spin`): the finished Ferris wheel (seats stay level),
  carousel and station solar wings turn slowly until knocking down starts.
- Round pieces brake while rolling on the ground (high angular damping; this
  ammo build ignores rolling friction) so rubble stays in view.
- Without ammo.js, a simple fallback still flings, drops and settles blocks.

## Tests (Node only: never a browser on the development PC)

```
node tests/builds.test.cjs [id]        counts, tiers, overlaps, floating blocks, chunk plans
node tests/bash.test.cjs [build] [id]  every destroyer against every build, chunked and whole
node tests/sound.test.cjs              every sound renders; every name the game plays exists
JSDOM=<dir>/node_modules/jsdom node tests/dom-smoke.cjs
                                       whole sessions by Space/Enter in jsdom, two switches and Auto Scan,
                                       including Hold to Build on (short, long, held to the end) and off
node tools/shot.cjs build|world|scene|bash|bashers|all ...
                                       CPU-rendered pictures into <hub>/tmp/bnb-shots/
```

`tools/harness.cjs` boots the real modules in Node; `tools/node_render.cjs` is
NARBE Racer's CPU rasteriser plus a sun-shadow pass.

## Adding things

- **A build:** append to `LIST` in `js/builds.js` with the kit (`k.add` places
  by the bottom of the block). Blocks go bottom up, each touching an earlier one.
  Name only notable pieces. Then run the build checker and `shot.cjs build <id>`.
- **A world:** `BNB.Worlds.register(id, {...})` in `js/worlds.js`; keep the plot
  clear and use `kit.free()` so nothing tall blocks the camera.
- **A destroyer:** `BNB.Bashers.register({...})` in `js/bashers.js`; see the
  contract at the top of that file. Use only the sound names listed in `js/sound.js`.
