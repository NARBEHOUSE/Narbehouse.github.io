# Changelog

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
- Sound, restored after the rebuild: the scan/confirm blip is synthesised by SafeAudio again (the rebuild preloaded it from a `select.wav` this game has never shipped, so it 404'd and went silent), and switching Sound Effects back on now re‑enables SafeAudio instead of leaving it muted until reload.

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
