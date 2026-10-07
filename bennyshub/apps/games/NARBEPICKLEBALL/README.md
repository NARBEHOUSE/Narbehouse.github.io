# NARBE Robot Pickleball

In collaboration with SCSU and student creator Lily Flack. Redesigned and developed by NARBE. Lily's original remains unchanged at ../PICKLEBALLRALLY/index.html and is linked from How to play & credits.

Open **NARBE Robot Pickleball** in Benny's Hub on the web or in Benny's PC Hub → Games. Refresh the web Hub, or restart the PC Hub, to load the updated listing and screenshot. Close and reopen an existing game frame for updated source. The pickleballrally identity and favorites are preserved. Three.js and all assets are local.

## Simple play

The robot automatically returns a visible ball within paddle reach, choosing forehand or backhand. Good positioning produces stronger contact; wide reaches produce safer, softer returns. The player automatically moves nearer to or farther from the net for short, middle and deep balls, with a reach animation for diving saves. You control sideways positioning. There are no hit-type choices, aim-lock stages or charges.

- **Two switches (default):** hold Space to move left, Enter to move right. Release to stop. Movement is continuous and stops at the edge.
- **One switch:** when the opponent returns the ball, each new Enter press chooses the direction toward its receiving position. Hold to move in that chosen direction and release to stop. Another press rechecks the incoming ball, so it can keep moving the same way or change direction as needed. Hub Auto Scan / One Switch also enables this control automatically, as in NARBE Racer. Space remains an alternate switch during play. A compact arrow shows NEXT HOLD and the armed left/right direction; while held, it shows HOLDING and the active direction. When already aligned it says IN POSITION / READY. The direction stays fixed during each hold. Outside an incoming return, the existing alternating repositioning behavior is retained.
- **Tap — no hold:** enable Movement input in Settings. Tap Enter (or Space) for each incoming return. The robot moves toward that ball’s contact location and stops with the paddle lined up; it never drifts past the target. Repeated taps keep targeting the ball. In No-fail mode the ball waits for this positioning before the paddle returns it. In one-switch held play and tap play, lining up after an input finishes the remaining approach promptly (about 0.22 seconds after the bounce, up to 0.5 seconds before it) without waiting through the remaining slow motion. The ball still traverses its bounce/contact path continuously.
- **Automatic:** the robot also follows the ball sideways, for hands-free rallies.
- **Mouse/touch:** drag across the court to send the robot there; it runs to the spot at a quick, steady pace rather than jumping. Returning the ball remains automatic.

Movement defaults to **Brisk** (3.4 court units per second), with Steady (2.4) and Relaxed (1.6) also available. Ball pace defaults to **Full speed** and is independent of movement speed. Existing saved speed and pace choices are retained; legacy movement speeds migrate to the matching tier.

Before every rally, the court offers **Your serve / Receive serve** and **Pause**. Space scans, Enter selects; Auto Scan supports one-switch menu use. Choices start at silent blank. A held Enter for six seconds also pauses during play; One switch accepts a six-second Space hold as well. Short Enter presses never pause gameplay, including Automatic mode; only a continuous six-second hold does. The pause timer checks the same still-held input that started it. Escape and the visible Pause control work throughout. Continue rally has neutral styling until actually highlighted by the scan.

### Serving

Choosing **Your serve** aims the serve. The target sweeps the whole legal diagonal service box, from the centre line (the T) out to the sideline, and the serve lands deep, about a metre inside the baseline. Serving into the other box would be a fault, so the aim never goes there. The receiving robot waits behind its baseline, so aiming wide or down the middle makes it move. While you aim, the view eases up and zooms a little toward the far box, which glows, with the target ring, the flight arc, a pin of light over the target and a chevron showing which way the target moves.

- **Two switches (hold):** hold Space to move the target; release to stop. Each new hold goes the other way, as in P3GL and Peggle (the first hold goes left). It stops at the edges of the box. Press Enter to serve.
- **One switch and Tap:** the target sweeps back and forth by itself. Press Enter to stop it where you want; releasing serves there.
- Holding Enter for six seconds pauses instead of serving. Mouse/touch: drag to place the target and release to serve. The aim speed follows the Movement setting (Steady sweeps the box in about five seconds).
- **Receive serve** starts the robot's serve straight away; it never needs your aim.

## Pace and rules

**Full speed** removes the approach slowdown and requires quicker positioning. **Relaxed** and **Slow motion** extend the incoming bounce. **No-fail** stops an unreachable ball at contact until the player reaches it. No-fail and Just rally are score-free: no points, match wins, target stars or competitive scoreboard. The only court count shows returns remaining until the next break. Just rally always uses the stopped-ball waiting behavior. In timed modes, incoming ball contact is the deadline: late positioning misses the return. No-fail and Just rally offer a fresh, blank Serve/Pause choice after six successful returns, once the last shot reaches the opponent. This rest break awards no point, keeps the server and score, and keeps the session ready to resume; it prevents an endless rally from trapping short-press users.

Matches use traditional singles scoring: only the server scores; a server's fault changes service without awarding a point. Games go to 11, win by 2. Serves originate behind the correct even/odd baseline side and land diagonally beyond the kitchen. Both the serve and return bounce before contact. Every later shot also uses a ground stroke. The next serve always waits for the player's choice. These rules follow the [USA Pickleball summary](https://usapickleball.org/rules/summary/); slow motion, generous reach and no-fail waiting are intentional accessibility adaptations.

Matches advance automatically through the robot opponents, after either a win or loss, and loop after the last opponent. The final score briefly appears on court; the next match opens at the normal Serve/Pause choice. There is no opponent picker or Play Again step. Progress saves the next match.

A resolved rally can score only once. An outgoing return cannot trigger a missed-return point. Flight stays continuous through bounce, paddle contact and CPU return. Serve ownership, scores, preferences and progress persist; previous saved games migrate to the current controls. Input cancellation, focus loss and hidden tabs stop both held and latched movement and pause the game.

## Implementation

- js/model.js: service ownership, side-out scoring, contact quality, automatic shot placement, varying court depth and continuous trajectories.
- js/game.js: switch ownership, hold/tap modes, Serve/Pause scanning, saves, speech and audio.
- js/scene.js: ceramic/metal robots, illuminated visors, spectators, court, the first-person camera and both robots' strokes. Both robots carry the paddle arm on a shoulder socket fixed to the torso, with fixed-length upper arm and forearm (no stretching) and a two-joint elbow solve with joint limits that swivels away from the head and torso. Each stroke (forehand, backhand, low and overhead on either side, plus the underhand serve) runs take-back → contact → follow-through → recovery. The contact pose puts the paddle face one ball radius behind the real contact point; take-back and follow-through turn that same arm at the shoulder, so the elbow and wrist keep a natural shape. Extra reach comes from footwork: an eased sideways/forward step (capped at a stepping pace, never a jump), a crouch for low balls and torso turn. The ready paddle rests slightly angled in front of each robot. First person looks out through the player robot's visor and briefly follows the ball onto the paddle, so low and overhead contacts stay in view. Robots never warp: displayed positions follow the court at no more than a sprint.
- js/model.js: also holds the stroke zones the opponent walks to, the lunge (footwork) limit that decides whether it can reach a ball, the player's stance depth, and the walk to the serve spots between points.
- index.html / style.css: compact court HUD, responsive 64px Serve/Pause controls and scannable menus.

The original game, shared accessibility managers, dependencies and existing release packages are preserved. The web catalog and NARBEHOUSE homepage link to this game; the original remains available through credits.

## Verification — 2026-10-07 (arm rebuild, footwork, serve aim)

Everything below runs in Node only — no browser, Electron or GPU (headless WebGL froze this PC before). three.js builds the real scene graph from scene.js/model.js with a stubbed WebGL renderer; the meshes it would draw are measured directly. Run from the desktop root:

- `node --test tests/rally-model.test.cjs` — 25 model tests: singles scoring, serves, bounces, contact quality, movement, depth, the stroke zones, the lunge limit (a robot out of footwork range misses), legal serve aim limits and robot serves ignoring the player's aim.
- `node --test tests/rally-arm-rig.test.cjs` — 7 tests over several thousand rendered frames for both robots: every accepted player offset (±1.14) at every incoming contact height, crossing the ball line mid-approach, opponent drives/dinks/lobs on time and lunging late, and both robots' serves on both sides. Each frame checks shoulder attachment, fixed segment lengths, elbow 8–150°, wrist ≤130° (a laid-back human forehand reaches about 110–135°), forearm never through the paddle face, vertex-level clearance of arm and paddle from the robot's own head/torso/legs, no paddle jumps, nothing of the player's own arm within 0.32 m of the eyes on screen, the paddle face meeting the ball at every contact, and every player contact on screen when the return fires (game.js only returns a visible ball).
- `node --test tests/rally-game-controls.test.cjs` — 10 tests running the real game.js with real Space/Enter key events and a controllable clock: two-switch serve aim (hold, release stops, each hold reverses, legal edges, Enter serves where aimed), one-switch and tap sweeps (Enter stops the target, release serves there), a six-second Enter hold pausing instead of serving, robot serves without aim, two-switch/one-switch/tap rally movement, six-second pause only, no-fail waiting and breaks, and **no warping**: every rendered frame of several points per control mode keeps both robots' sideways speed at a run and never jumps.
- `node tests/rally-visual-review.cjs` — writes review sheets (player strokes in first person beside an outside view, the opponent from the player's position and from the side, serve aiming) to tmp/rally-visual-review. These sheets were reviewed for this change.
- `node tests/rally-stroke-tuner.cjs` — scores (and with --tune re-tunes) the stroke parameters if the robot shapes change.

Not run in this pass: tests/rally-browser.cjs, tests/rally-electron.cjs and the F-drive scripts/check-rally-club.cjs (browser/Electron harnesses). They may need updating for the new serve-aim step. These checks do not replace Ben's physical-switch play test.
