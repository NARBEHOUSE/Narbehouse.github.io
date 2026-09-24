# Baseball player art and batting update

The default batting control is **Pick a Swing**. First, scan the field for
**Ready to Swing**, a stealable base, or Pause. Switch scanning focuses stealable
bases; Ready/Pause and pointer highlights keep the field wide.
Ready to Swing calls the pitch aloud, waits for the call to finish, then zooms
in for delivery. The ball freezes near contact at its actual pitch location. A compact menu beside the
batter offers Normal, Power, Bunt, Take Pitch, and Pause with no deadline.
Choosing resumes that ball, without another delivery. Pausing preserves it.
**Hold to Charge** remains available in main and pause settings. There is no
sustained press or release window in Pick a Swing.
Taking a pitch uses the displayed location for its ball/strike call. Selected swings feed
baseball execution quality into the existing contact tables, including misses,
fouls, and outs. Storage failures retain the selection for the session.

Batting motion uses the [R.B.I. Baseball '94 sheets](https://www.nes-snes-sprites.com/RBIBaseball94.html)
(ripped by Locke_gb7) as a pose and timing reference. The shipped artwork is still
our procedural model. The front foot plants before contact, the hips lead the
shoulders, and the rear cleat pivots as weight transfers forward. The charge
starts over the shoulder, moves forward into a bunt position, then draws back
into the power load. Bat/arm lengths and gameplay contact frames stay fixed.
`check_batting_pose.py` checks coordination and body clearance;
`check_bat_visibility.py` checks the barrel through the actual rendering camera.

`build_players.py` authors a shared 3D player from body landmarks, tapered limb
meshes, uniforms, equipment and action poses. It uses the same `wam.render`
software renderer used by Football, plus numpy and Pillow. It does not use
external character art. All sprite sheets are rebuilt at 256px per cell
(rendered at 768px and averaged into 256px cells with antialiasing),
displayed at 84px before the game's player scaling. The batter now has a wide
stance along the pitch direction, a front-foot plant and a two-handed follow-through.
Pitching, catching, fielding and running use the same
body proportions, lighting and ground plane.

The revised model uses an elliptical, tailored jersey, shaped jaw and helmet,
uniform piping and numbers, tapered pants, socks, laced cleats and a cupped glove
with fingers and webbing. Catcher gear has separate mask, chest and shin pieces.
Offensive running clips retain batting helmets and omit fielding gloves. Idle
defenders use position-specific ready poses. Labels sit above the larger players.
The high-contrast outline no longer blends gray into antialiased uniform edges.

Outfielders stand upright between pitches, with a waist-high glove and a modest
knee bend during delivery. Left and right field face inward toward home plate;
their home positions form a wider, balanced arc around center field. Fly catches
recover to the taller stance, and ground pickups lower only for the gather.
Returning players use a compact recovery jog until they arrive.
`check_outfield_pose.py` checks posture, facing and catch/gather contact timing.
`node art/check_browser.js --returns` checks recovery jogging, live-pitch readiness,
catch/throw recovery, arrival poses and equal player scale in Chrome.

Pitching now joins a balanced knee lift, planted stride, hand release and
trailing-leg follow-through without jumping between clips. Pitch reception
ends at the catcher's glove, holds the receive frame, then transfers to the
throw-back. Pitch movement offsets taper to zero at the endpoint.
The batter's left hand stays by the knob, with the right hand above it; the
bunt uses a split grip. On-deck hitters wait upright with the bat lowered.
Separate jogging clips retain their helmet and carried bat. After a completed
plate appearance, the waiting hitter jogs into the box and a new hitter jogs
from the dugout to the on-deck circle. Balls, ordinary strikes and fouls retain
the same batter; the third out and a walk-off do not bring in another hitter.

`js/ballpark.js` paints the grass, curved infield apron, warning track, padded
wall, seating, mound and chalk once into a cached texture. The same geometry
still drives gameplay. Large white scores sit on dark cards with team-colored borders and stripes.
`node art/check_browser.js --flow` checks the spoken-call ordering, base-focused
setup, frozen-ball menu, zoom/pause, catcher alignment and visible lineup handoff.
`node art/check_audio.js` checks narration completion and error/disabled fallbacks.
`check_pitching_pose.py` verifies delivery continuity and planted-foot timing.

The generated `js/player-art.js` owns the cell size, frame ranges, animation rates and projected
hand/glove/bat anchors. **Bake the PNGs, material masks and that file together.**
Each sheet has a matching `-materials.png`: red stores jersey shading, green
stores skin shading (both at half strength), and blue stores outline coverage.
Materials are separated before downsampling, so blended edges retain each
material's contribution. Runtime recoloring never guesses materials from edge
colors or removes gray model details. Normal mode preserves body coverage;
high contrast composites a white outline underneath it. Positive-weight area
filtering avoids ringing in the bake. A generated content version on image URLs
keeps browsers from mixing old sheets with new frame tables.
The game uses ordinary sprite sheets, not a real-time 3D engine.

Start Game immediately acknowledges the selection and guards against repeated
activation. The field backdrop renders during asset loading, with visible
loading/preparation progress. Team selection preloads the required images.
Initial uniform variants are prepared one per frame, grouped by source sheet;
only the current source/mask pair is retained for reuse, then released. The
pixel loop skips transparent padding and unchanged materials. This preserves
the full-resolution art while avoiding one long synchronous scene-creation stall.
Players enter and the opening announcement starts once their textures are ready.

The baseball uses cached 128px canvas textures: shaded leather and a separate
layer of red panel seams and paired stitches. Only the seams rotate in flight;
the lighting stays fixed and rotation pauses when held. A feathered shadow
replaces the hard oval. Its 3px display size matches the rig's hands, with a
proportionate shadow; the separate accessible timing ring remains unchanged.

`rendering.js` keeps a 1000x600 logical world while drawing into a real canvas
backing store at 1–3 times that resolution, chosen from the fitted screen size
and pixel density. It updates on window/density changes. Cameras, pinned UI,
text and pointer coordinates share that scale. Phaser's CSS-only Scale Manager
zoom is left at 1. Source textures remain below 4096px in either dimension.

The first physical play sequence is a **bases-empty grounder to first while the
player bats**. The runner, fielder and cover player move at independent speeds.
The ball must arrive and first base must be covered before an out is recorded.
The runner runs through first. Reaction time, ball speed, placement and arm
rating create variation, without changing runner speed to force a chosen result.
Occupied-base and CPU fielding menus retain their existing force/relay rules;
they have not been converted into the new race simulation.

Both teams now chase fly balls to reachable landing positions, plant before
the catch and time the arrival to the glove's contact frame. Catch/receive
artwork raises the glove, secures the ball and lowers it again. Defensive
one-shot animations return to the position's ready pose (or the active run),
without interrupting newer actions. Returning defenders reset even when they
already occupy their home position. Ambient shuffles run only in pre-pitch menus.

Grounders, singles and gap hits start pursuit at contact. A pickup waits for
both player and ball to arrive, then completes on the gather frame. Gap hits
skip to the pickup point while the outfielder and cutoff man move concurrently.
Pitchers can use infield gather/throw clips. Fielding close-ups hide the scoreboard
until the full field view returns, as batting close-ups already do.

All player travel uses `js/movement.js`: footprint-based path routing, short
swept movement steps, and replanning around moving players. A blocked player
waits rather than crossing another body. Retargeting cancels the old route;
arrival callbacks fire only at the destination. Run animations pause while
waiting. Defensive bag coverage, occupied-base runners and dugout queues have
separate standing positions. These are ground footprints; normal perspective
overlap of heads/arms and close glove tags is still possible. Path detours can
extend travel time; the older scripted play outcome rules remain unchanged.

From the game directory:

```powershell
& 'F:/PROJECT FILES/TOOLS/wam-main/.venv/Scripts/python.exe' art/build_players.py
& 'F:/PROJECT FILES/TOOLS/wam-main/.venv/Scripts/python.exe' art/check_art.py
node art/check_game.js --record
& 'F:/PROJECT FILES/TOOLS/wam-main/.venv/Scripts/python.exe' art/render_replay.py
& 'F:/PROJECT FILES/TOOLS/wam-main/.venv/Scripts/python.exe' art/review_players.py
node art/check_browser.js
node art/check_movement.js
```

Use any Python environment with WAM, numpy and Pillow if that local toolchain
path differs. The game itself needs none of these tools. Rebuilding the art is
only necessary after changing the source model or clips.

`check_game.js` executes the real menu/input/play methods with a deterministic
clock and tween adapter. It covers saved controls, release activation, Numpad
Enter, auto/manual scanning, indefinite selection, pause switching, all swing
types and pitch locations, the original charge route, settings layout, and 160
grounder races. `check_art.py` checks every shipped frame and contact anchor.
The simulation also covers 60 fly chases, 20 ground pickups and 20 gap-hit relays.
Chrome checks the fly catch's glove alignment, recovery for all nine defensive
positions, return to home, and close-up HUD visibility. Screenshots of pursuit,
catch and recovery are saved as `%TEMP%/bennysbaseball2-review/browser-fly-*.png`.

Optional preview commands regenerate `out/players-detail.png`,
`out/players-review.png` (add `--preview` to the build), `out/baseball-play-review.png` and
`out/baseball-replay.gif` are visual reviews; the replay uses actual recorded
game positions and frames. They are simulation renders, not browser captures.
The detail board renders the source mesh large alongside a game-size sprite.
`art/out/` is disposable and ignored by Git; delete it when reviews are no longer
needed. Normal art builds produce only the shipped sheets, masks, and frame
tables. Browser screenshots and profiles remain in OS temporary storage.
`check_browser.js` starts an isolated headless Chrome session and a temporary local
server, checks real Phaser textures and ready poses, sends Enter to select a swing,
and checks for JavaScript exceptions. It saves actual browser screenshots as
`%TEMP%/bennysbaseball2-review/browser-*.png`. Pass a Chrome executable path as its optional argument.
It also samples player separation throughout a real grounder to first.
The browser check verifies backing resolution, a density change to a 3000x1800
canvas, camera framing, and clicking a settings button after that resize.
Team selection is checked at desktop, small-window and portrait sizes, including
scene re-entry, season setup, arrow clicks, Space cycling and Enter to start.
Its `init` calls the base scene initializer so the camera uses the same logical
coordinates as the layout. The check also verifies ball spin/stop and fixed
lighting, and exports `%TEMP%/bennysbaseball2-review/browser-baseball.png` at several display sizes.
`browser_material_audit.js` checks all sheet pixels after actual canvas recoloring
in normal and high-contrast modes, preserving coverage and opaque neutral details.
It saves `%TEMP%/bennysbaseball2-review/browser-materials.png` with representative frames and varied skin tones.
`check_movement.js` covers crossing/head-on paths, stationary blockers, occupied
destinations, dugout queues, retargeting and slow frames. The game simulation
checks separation during loaded-base advances and all 160 grounder races.
Headless checks do not replace a playthrough with the player's switch hardware.
`node art/check_browser.js --startup` runs the shorter mouse-start check and
saves `%TEMP%/bennysbaseball2-review/browser-startup.json`: feedback, field visibility, scene creation and
player readiness timings. It also checks duplicate activation and rendering
during preparation. The full browser check exercises keyboard start instead.

Browser profiles and screenshots stay in the operating system temporary directory,
never under the website watched by Live Server. Cleanup closes the actual browser
over CDP and uses its verified PID for a Windows process-tree fallback; killing
only the launcher can leave detached Chrome processes running.
Use `node art/check_browser.js --stability` to repeat live fielding for at least
45 seconds and check rendering, scene creation, and unexpected page reloads.

Pitcher delivery reference: the [WSU pitching manual, stride and firing phases](https://cdn1.sportngin.com/attachments/document/802c-3330691/Pitching_Manual_-_Final.pdf)
and a [photographed pitching sequence](https://bbs.kakaku.com/bbs/K0000402689/SortID=17682216/).
The windup turns the torso sideways, keeps the shoulders closed while the hips
open at plant, then rotates through release and follow-through. Fixed-length
arm and leg solves prevent the joints stretching during these transitions.
`node art/check_browser.js --pitcher` verifies every delivery frame actually
plays, runtime animation state stays synchronized, duplicate activation cannot
restart a pitch, and each delivery releases exactly once at the hand anchor.
`review_pitcher.py` can regenerate `out/pitching-motion.gif` to preview the
current baked delivery at its game speed.

The left leg now lifts in the turning pelvis' coordinate frame, with the right
pivot foot stationary. The knee faces the same side as the jersey at balance;
the free leg opens toward home during the stride. The rear foot lands before
the front foot steps back into the ready stance. Release uses frame 6 of 10,
matching the authored forward extension, and is checked in the browser.
Leg-lift photo studies: [five-phase lift](https://column.sp.baseball.findfriends.jp/?id=002-20181126-33&pid=column_detail),
[Nippon Ham sequence](https://column.sp.baseball.findfriends.jp/?id=004-20200817-01&pid=column_detail),
[Buffaloes sequence](https://column.sp.baseball.findfriends.jp/?id=002-20201987-78&pid=column_detail),
and [Marines sequence](https://column.sp.baseball.findfriends.jp/?id=004-20210816-01&pid=column_detail).
Reference images stay in OS temporary storage and are not shipped with the game.
Run `python art/review_pitcher.py` with the WAM environment after baking to
refresh `out/pitcher-sequence-review.png` and `out/pitching-motion.gif` from the
actual shipped atlas. `check_pitching_pose.py` verifies the lift plane, supporting
foot, bone lengths, planted front foot, and recovery step.

Recent gameplay checks:
- Ready/Pause highlights restore the full field. Pointer highlights never
  zoom; switch scanning still focuses steal/throw bases. Confirming Ready
  begins the delivery close-up.
- Side changes use 100-125 field units/second jogging, with
  arrival callbacks gating the next team and next pitch.
- Throw hints describe attempts, and relay narration reports actual outs.
- Ball, Strike and Foul show only the centered outcome; counts stay in the HUD. Walk, strikeout and
  hit-by-pitch have visible calls too; replacing a call cancels its old fade.
- Foul flights remain visibly in foul territory for over a second. Contact
  outcomes are checked for visible ball movement, misses for no hit sound.
- Home runs use one recorded celebration; generated cheers cannot overlap it.

`node art/check_browser.js --flow` checks pointer/switch highlights, batting,
pause, catching, lineup replacement, and actual side-change movement.
`node art/check_browser.js --contact` checks real visible foul/miss/home-run
paths, impact/celebration events and centered pitch-call text.
`node art/check_game.js` covers every batting contact result and both side-change
directions; `node art/check_audio.js` checks speech and celebration ownership.
Browser captures remain under `%TEMP%/bennysbaseball2-review`.

At game start and half-inning changes, both the batter and the on-deck hitter
walk in from separate dugout positions. Team readiness waits for both arrivals.

Player lifecycle: retired hitters, caught runners, scoring runners and stranded
runners leave toward their own dugout and are removed only after reaching an
offscreen position. Safe runners retain the same actor from running through
standing at the bag. Half changes include departing hitters and runners, and
wait for the outgoing roster before bringing in the next team. Saved-game
runners enter visibly from the dugout before the next pitch is enabled.
`node art/check_browser.js --lifecycle` exercises a strikeout and a loaded-base
third out, recording removal coordinates and actual browser exit screenshots.
The simulation also checks steals, safe-runner identity, all scoring exits and
both directions of side changes without overlapping player footprints.

Transition routes use a spaced departure queue and separate foul-side paths for
outfielders, the catcher behind home, hitters and retiring runners. Clear paths
stay stable instead of being replaced every few frames. Rounded route corners
retain physical player separation. `node art/check_browser.js --routes` checks
both dugout directions and records actual route traces in OS temporary storage.

Defensive throws now use the rendered release frame: glove transfer, shoulder
turn, planted stride, overhand release and follow-through. The catcher stands
before throwing. Infield plays, outfield cutoff relays, steal attempts and
routine returns to the pitcher share that handoff. Receiving players extend
and hold their glove until the ball arrives; recovery waits for the catch to
finish. Ball ownership follows the actual fielder, including a pitcher away
from the mound. `node art/check_browser.js --throws` checks release frames,
hand/glove alignment, every defensive position's return, and complete relays.

Player anatomy uses fixed role-specific upper-arm and forearm lengths, with
compact fielding and travel poses and a preserved pitching/swinging reach. The on-deck hitter has relaxed
hands below the waist and a lowered bat angled clear of the ground. Elbow
placement keeps bare arms outside the jersey, with an outward hand-separation
path for throws and the pitcher's windup. Recovery jogging and running use compact arm swings with complete forearms.
`python -B art/check_player_anatomy.py` checks every shipped frame for arm
lengths and torso clearance, samples animation continuity, and measures both
on-deck forearms through the renderer's depth buffer. Use the WAM Python
environment, as with the other art checks.

## Pitch decisions and athletic movement

Both batting modes share pitch type/location profiles. A circular green, yellow,
or red highlight is accompanied by **Favorable pitch**, **Neutral pitch**, or
**Difficult pitch** in text and speech. No shape symbols or swing recommendations
are shown. The ball waits indefinitely in Pick a Swing; charge mode slows near
contact. Continuing to hold or never charging takes the pitch. Normal, power,
and bunt have different contact probabilities for the same delivery. A hard
pitch may still be a strike; a favorable pitch never guarantees a hit.

The pitching selector keeps five spatial strike-box choices with flat colors and the original curved sections/center diamond:
one to three Favorable matchups, exactly two Risky pitches, and Neutral choices for
the rest. Risky pitches reward hitting the spot with more misses and punish missed
spots with harder contact. Repeating a pitch becomes less effective. Pause
preserves the current choices. Text and speech explain the labels.

Inside misses can visibly hit a batter and award first with forced advancement.
The second hit batter in an escalation streak prompts a warning; the third
and every subsequent hit batter trigger a cartoon brawl. Selecting a Neutral
or Favorable pitch resets the escalation count (the game total is retained). Bench players jog in from offscreen. A ten-second
rumble starts with the batter and catcher approaching each other, then moves
into the infield. Other players join as they reach the action, while bench players
continue running in from the side. Participants continually shuffle, change
opponents and turn at independent intervals.
Collision avoidance stays active. Dust builds gradually after contact rather
than appearing fully formed. A moving dust cloud, comic bursts and soft
commotion sounds follow the crowd; players
then brush themselves off and return to their saved positions. Bench extras
exit offscreen. The free base is awarded afterward. No new input is required.
The player can also be hit in either batting mode. Repeated Risky pitching
choices compound the hit-batter chance: 3.5%, 7%, 14%, 28%, 56%, then an 80%
cap. Each consecutive Risky choice doubles it regardless of pitch type; a
Neutral or Favorable choice resets that team's streak. There is no deliberate hit-batter option.

Fielders and runners have shorter arms. The on-deck bat arm is relaxed and nearly
straight. The legacy `walk_*` clip names now contain a light recovery jog, with
bent elbows and a compact arm pump; hitters retain their carried bat. Entrances,
exits and returns use measured jogging speeds. An already exiting runner keeps
his route through a side change, and rounded route corners retain the gait.

`node art/check_game.js` exercises pitch quality, swing matchups, taking pitches,
risk/payoff statistics, pause persistence, runner exit continuity and HBP recovery.
`node art/check_browser.js --pitch-choices` checks the actual renderer, frozen
reads, charge cues, the five cards, score colors and the third-HBP sequence.

Choice speech explains each swing and pitch risk category once per game, then
uses short labels on repeated scans. The frozen-pitch read says only its quality;
pitch type/location were already announced during delivery and remain visible.

Defensive coverage uses distance-based running at 115 field units/second, with
an overall 130-unit defensive speed ceiling. Pitchers start covering first at
ground-ball contact when the first baseman is fielding it. A throw waits for
its receiver to reach the bag or cutoff position; receiving no longer cancels
a coverage route early. The actual pitcher-to-first regression is included in
`node art/check_browser.js --throws`.

Doubles/triples use continuous 110-unit running strides. Coverage begins at
contact and automatic pickup/relay transfers release within 1.5 seconds in
simulation. A short gather can align a close play, but the fielder never waits
for an entire running leg to manufacture one. Earlier throws show a tag attempt;
safe calls wait for the actual runner and ball arrivals. `node art/check_browser.js
--races` verifies both teams' doubles/triples. Simulation also checks close safe
throws to all four bases.

Outfield singles now offer the same accessible on-field target selector as
infield grounders: first, each additional live forced base, and the pitcher.
There is no decision timeout. Choosing the pitcher immediately animates a throw
back while runners finish advancing. Outfield throws do not invent a second
out through an automatic double-play relay.

Extra-base regression checks include the full return-to-pitcher and next-menu
sequence for both teams, with empty and loaded bases. A tag after a catch uses
the defensive-action lifecycle so it cannot leave the receiver permanently busy.
Gap-hit bounces roll along the drive's direction, stop inside the fence, and keep
cutoff positions clear of the runners' base-touch points.

Batting keeps one pitch-read location for the entire delivery. Pick a Swing holds
that exact ball position until the swing's contact frame; Charge continues the
original pitch curve to the original endpoint. Neither mode redirects the ball
to a swing-specific sprite anchor. Doubles/triples launch from actual contact,
without resetting the ball to home plate. Continuity checks cover all five pitch
types, three locations, three swings and both batting modes (90 combinations).

Scuffle punches require a live opponent from the other team within 30 field
units, horizontally aligned with the side-facing sprite. Players jog into reach,
face their opponent every frame, and stop punching immediately if that opponent
moves away. Short bouts and repositioning keep the crowd moving. Simulation and
browser checks inspect range, alignment and sprite facing throughout the fight.
