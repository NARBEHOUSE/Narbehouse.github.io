# Changelog

## 2026‑08 — Multiplayer, audio cues and mobile layout
- **Fixed a stuck-switch bug that only appeared inside the hub.** The shared scan manager filters out presses shorter than the user's tremor threshold and swallows the keyup of a rejected press. The game reset its menu scan state on the resulting `narbe-input-cancelled` event but never its gameplay state, so a quick tap left `spaceHeld` set and the ball oscillated as though the switch were still held. The hub pushes its own, higher, threshold into the iframe over `postMessage`, which is why launching `index.html` directly never showed it.
- Up to 4 players, hot-seat on the centre lane. Each has a colour, their own ball, and their own scoresheet; the scoreboard names whose turn it is and shows everyone's running total. Turn passes when a frame closes, finished players are skipped, and the game-over screen ranks all players and names the winner.
- New game setup screen on Play Game: players, per-player ball colour and alley theme, with the alley visible behind so theme changes can be seen. These moved out of Settings, which is now half the length.
- Charge audio: a rising five-note ladder, one note per 20% of power, matching Benny's Mini Golf note for note, plus a repeating chirp at full power. Charge window lengthened 3s → 5s to match Mini Golf, and `CHARGE_POWER_CURVE` dropped 2.5 → 1.6 because the old exponent put 90% of the power in the last two seconds of the longer window.
- Aim audio: soft sine blips that speed up, rise in pitch and pan towards centre as the aim converges, with a chime the moment the line will actually strike a pin. It tracks the pins that are *standing*, so on a spare it rewards aiming at the remaining pins rather than at the centre of the lane. Independently switchable from the charge cue.
- Pause hold decoupled from charging and lengthened to `CHARGE_TIME_MAX + 3s`; a full charge used to open the pause menu instead of bowling.
- The rolling sound now loops for the length of the roll and follows the ball's speed, instead of a 0.95s one-shot that ended while a slow ball was still travelling.
- Mobile: the scoreboard scales to fit the viewport (all ten frames and the total stay on screen in portrait), overlay panels are viewport-relative rather than fixed 420–480px, and the hint box drops to one line docked in the corner on small screens so it never covers the ball.
- Pins added to the outermost decorative lanes; the house floor, walls and ceiling now run the full depth so the background no longer shows through at the edges on wide screens.
- Fixed the settings ball swatch showing green regardless of the chosen ball: the row's preview was never painted until first activated.
- Settings and the setup screen hide whatever menu they were opened from, so the panel text isn't competing with the menu behind it.
- Fixed every player's ball showing the same colour. `Object3D.clone()` shares material references, so all four ball meshes were one material and whichever style was applied last repainted the lot — with 2 players, player 1 got player 2's ball. Each player's ball now gets its own material.
- `sound/rolling-ball.wav` normalised +10.4 dB. It was mixed at –31.8 dB RMS, 12 dB below the pin and strike samples, so the roll was inaudible under the pin crash even though it was playing correctly. Now –21.4 dB, in line with the rest, and the speed-tracking volume has a much higher floor.
- Roll playback pulled back to 70% (`ROLL_VOLUME`), applied to both the one-shot on release and the speed-tracking loop. The normalisation above brought the sample up level with the pin and strike hits, which made the roll itself louder than it needs to be; scaling the gain rather than re-cutting the file leaves the speed dynamics and the audible floor for a slow ball intact.
- `sound/select.wav` doesn't ship with the game; the menu blip now uses SafeAudio's built-in synthesised tone instead of failing to load on every startup.

## 2026‑08 — Real Alley rebuild
- Replaced the flat stand‑in floor with a full procedural alley (`js/alley.js`) whose every surface is derived from the collision constants in `bowlphysics.js`, so the picture can no longer drift from the simulation.
- Fixed pins and the ball sinking through the floor: the old visual floors were deliberately dropped 6 cm below the real collision planes, so anything that reached the pit passed straight through the wood. Lane, gutters, pit and deck now sit exactly on their collision planes.
- Real lane furniture: 39 boards with maple/pine/maple zones, seven targeting arrows in a V, foul line, ten pin spots, approach dots, coved gutters, capping boards, kickbacks, pin deck, ball pit with a padded cushion, and masking units.
- Oil pattern driven by a roughness map — glossy through the heads, dry at the back end.
- Neighbouring lanes, concourse, walls and ceiling, so the view reads as a bowling centre rather than a single floating lane.
- Overhead deck lamp with soft shadows; ball and pins now cast contact shadows on the deck.
- Lane sheen: an oiled‑lane streak under the ball and each pin, laid flat in the lane plane so it stays depth‑correct from any camera.
- All 10 themes reworked to repaint the whole alley; neon themes drive an emissive map so arrows, foul line and approach dots glow.
- `CAMERA_FAR` raised 10 → 60 so the far end of the house is not clipped; antialiasing enabled.

## 2025‑10 — Accessible Edition (NARBEHOUSE, LLC)
- Added single‑switch navigation (Space scans forward; hold Space ≥3s scans backward every 2s; Enter selects).
- Aiming via Space (5s oscillation; resumes from release), thicker aiming line; charge‑to‑throw via Enter (0–3s, non‑linear power).
- TTS (English voices only, up to 8): UI focus, settings changes, outcomes ("Strike!"), frame calls, final score.
- Pause menu (hold Enter ≥5s or click Pause) with Continue, Settings, Main Menu; keyboard scanning works there too.
- Two‑Player mode; each player chooses ball style; independent scoring.
- Retro green/black UI; stronger focused highlights; strike celebration overlay.
- Themes (10) with animated walls/backdrops; alley tint changes with theme.
- Environment aligned to lane; back/side walls and scenic backdrop; gutter‑aware floor (center + recessed gutters).
- Pins forced to bright white with minimal lighting tint for readability.
- Audio: ambient loop (`sound/bowling-bg.wav` @ ~30%), rolling (`sound/rolling-ball.wav`), per‑pin (`sound/single-pin.mp3`), music (`music/music (1).mp3`).
- Physics stability: clamped timestep, CCD for ball and pins, increased substeps to reduce tunneling.

Acknowledgements: Original project by iliagrigorevdev. Dedicated to @BEAMINBENNY.
