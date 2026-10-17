# Benny's Sphere Splash — design notes (working title)

An original homage to blitzball (Final Fantasy X / X-2): underwater team sport in a
floating sphere of water, full team management, nobody steers a swimmer. The match
plays itself and **freezes at every decision the rules create**; the player picks
from choices pinned to the scene. No Square Enix names, teams, players or moves.

The hub rulebook, `bennyshub/ACCESSIBILITY.md`, outranks this file.

## Status

| Milestone | State |
|---|---|
| M0 tech spike (3D stack, swimmers, on-screen choices, carry-swim) | done (the spike itself retired in M2) |
| M1 match rules engine | done — `js/data.js`, `modes.js`, `ai.js`, `sim.js`; `tools/check-sim.cjs` green |
| M2 Quick Game, playable grey-box | built, all checks green — **waiting on Bryan's playtest, voices off** |
| M3 art and presentation | next, after the playtest |

## How a match works (`js/sim.js`)

- **6 a side** (LF, RF, MF, LD, RD, GL), two halves of game clock (5 min, or 2 min in
  Quick Game), golden-goal overtime in cup matches. **The clock only runs during live
  play** — never while a decision is on screen, so nothing is ever on a deadline.
- **Stats** (FFX): HP, SP, EN, AT, PA, BL, SH, CA. Carrying drains HP; passes, shots and
  techniques spend it; below a quarter of max HP, PA and SH halve and techniques are off.
- **Encounter**: an opponent who gets close *and is in the carrier's path* starts one.
  - The **defense** picks a stance first: **Tackle** (full-strength tackles, but a tackler
    cannot block) or **Block** (stand in the lanes: wider, stronger blocks; tackles at half).
  - The **carrier** then picks Pass / Shoot / Dribble (with techniques) **blind to the
    stance**; its odds are computed against how those defenders usually play
    (`ai.stanceMix`). That is the guessing game.
- **Pass / shot**: strength = rolled PA/SH, minus distance decay, minus each blocker in the
  lane (a blocker who beats what is left stops it — intercepts if clearly stronger —
  otherwise takes half their BL off it). A surviving shot meets the keeper's CA: goal, catch
  or parry. Every pass in a row makes the defense read the next one better.
- **Dribble**: each tackler's AT comes off the carrier's EN; at zero the ball is lost.
  Speed over the tacklers helps (half the SP gap is added to EN).
- **Shot chances** at 5 m (point blank) as well as in encounters. (The 14 m chance with
  "keep swimming" was removed 2026-09-30 - see Open questions.)
- **Difficulty** (Settings: Easy / Normal / Hard, default Normal): every stat but HP of the
  team the player plays for is multiplied by `RULES.DIFFICULTY` (x1.4 / x1.2 / x1.1,
  `sim.js setBoost`). The other team and CPU-vs-CPU matches are untouched; it can change
  mid-match.
- **Outcomes are rolled once, the moment an option is chosen, then acted out.**
  Odds shown to the player are Monte Carlo on a *separate* random stream, so looking at
  odds never changes the match. The AI chooses from the same odds (`ai.valueOf`).
- Deterministic and JSON-serialisable: same seed, same match; `snapshot()` at any
  decision and `restore()` resumes exactly.

## Decision stops (the player's control over pacing)

| Setting | Stops for the player | Per full match (measured) |
|---|---|---|
| Our ball only | every encounter, point-blank chance and keeper throw when we have the ball | ~50 |
| Attack and defense | the above, plus our defensive stance | more |
| Key moments | point-blank chances, and encounters where Shoot is at least a Fair chance | ~34 |
| Coach | none; the AI plays our decisions by the same rules | 0 |

Quick Game's short halves cut these by about 60%.

How many stops is too many is **tuned by feel in a live game, not by count** (Bryan,
2026-09-29). These numbers are the baseline to compare against, not targets.

## Controls: three input contexts (`js/ui.js`)

Everything fires on **release**, and a press of any length short of the full pause hold is an
ordinary press (a player may hold a switch for seconds without meaning to).

| Context | What is on screen | Space | Enter | Hold Enter |
|---|---|---|---|---|
| card | a menu card (NARBE Racer's card engine) — CHOICE | next (hold = scan back) | choose | — |
| world | a decision, laid out on the scene, match frozen — CHOICE | next (hold = scan back) | choose | Pause (ring + ticks) |
| live | the match playing — MECHANIC | Huddle | Huddle | Pause (ring + ticks) |

- Cards and decisions run on the hub's shared choice scanner (`shared/choice-scan.js`
  through `NarbeChoiceScanAdapter`, ACCESSIBILITY.md §4, adopted 2026-10-04 from Ari's scan
  upgrade). It owns the highlight: the silent blank stop on every lap (both directions),
  Auto Scan, Parking, the Space Brake (dotted outline on the lit plate, or round the bracket
  frame for a teammate in the water; "Parked" badge bottom-right or in the card's corner) and
  Wait for Speech. Those four live only in Hub Settings. `ui.js` owns the keys, the
  scan-back and pause holds, and what each item does.
- Every new card and decision opens on the blank. First Space = first item, hold Space =
  last, Enter on the blank does nothing. Back from a nested screen lands on the item that
  opened it (Quick Game > Back = Quick Game; Settings > Back = Settings; Pass > Back = Pass).
  Changing a setting's value keeps the highlight.
- The **Huddle**: Continue · Call it Now · Formation · (Coach: Skip to Full Time) ·
  Settings · Pause Menu. Pause is also the last stop of every decision scan and an on-screen
  button. Continue from Pause asks the same choice again, on the blank (a separate modal
  return may start fresh, ACCESSIBILITY.md §4).
- Hold thresholds (scan back 3 s, ring 2 s, pause 5 s) live in `ui.js` and are never quoted
  to the player.

## The camera (`js/director.js`)

Bryan (after M2): like Ballista and most sports games, **follow the ball, in tight during
play, and zoom out to the players who matter during a choice.** Always the same side of the
pool, so our team always attacks to the right; every move is eased, never cut (the one
exception: the cut to the wide view after a goal, below).

- **Live play:** about 12 m of pool across the screen round the ball (`TIGHT_HALF`, tune by
  feel), looking half a second ahead of where the ball is going.
- **A pass or shot in the air:** widens fast to keep where it is headed (the receiver, the
  goal) in the picture, then closes back in slowly once it is caught.
- **A decision:** pulled back round the carrier, defenders, pass options and goal (below).
- **Nobody blocks the view** (`fadeBlockers` in `game.js`): a swimmer much nearer the lens
  than the ball fades out, and one between the camera and the ball turns see-through. Never
  the carrier, and never anyone who is part of the choice on screen.
- Big banners (GOAL!, Intercepted!) sit high on the screen, because the ball is now always
  in the middle.
- **Distance settled:** Bryan (2026-09-30): the live-play camera distance is good; leave `TIGHT_HALF`.
- **A shot is a moment (M3, Bryan: "dang near perfect").** Every shot, ours or theirs: the
  clock waits 0.6 s while the shooter winds up (`WINDUP`), the ball flies at 40% speed
  (`SLOWMO`, easing back over 0.35 s after it lands), and with **Shot Camera: Cinematic**
  (Settings; default) the camera comes in over the shooter's shoulder on our side of the pool,
  looking down the shot, then swings to the goal mouth framing ball and keeper once the ball is
  halfway, and eases back 1.1 s after the result (`director.js` mode `shot`, `game.js`
  shot moment). Steady keeps the broadcast camera, and keeps the wind-up and slow motion. The
  shooter and keeper never fade. All display: the sim has already decided the shot.
- **The shot's moves (M3, `js/moves.js`).** No throw, dive or catch in the free clip library,
  so they are built over the clips (rig.js IK + a body pivot at the pelvis), from pose
  references in `Projects/Assets/SphereSplash/pose-refs`. Bryan chose: normal shots are a
  water-polo **overhead throw**, technique shots a **volley kick**. The keeper starts in a
  goalie's set position (hands at the chest), reaches the short way in front of the body, and
  catches (clutch), punches, or is beaten at full stretch; a blocking defender reaches an arm.
  Bryan's playtest fixes: the aim point is the goal, BEHIND the keeper (256 of 257 shots,
  1.5 m), so the keeper reaches for where the ball crosses them (`cine.cross`); a save stops
  the ball there; a goal bends round the keeper by at least 0.9 m (it flew through them);
  a ball above the shoulders turns the whole body to it (the arms had crossed the face).
  **Technique kicks (M3 animation step, Bryan 2026-10-03):** each family of technique shot
  has its own big body shape, so they tell apart at match size: Beamin' Blast (and Super Beamin' Blast) a
  **backflip**, back to the goal, the ball struck over the face at the top of it; Spin Shot a
  **full turn into a sweeping side kick**, the ball tossed up for the turn; Ghost Shot a
  **scorpion**, back to the goal, both heels curled over the back, one whipped through. The
  status shots (Sting, Snooze, Wilt) keep the volley. The clock waits until each move
  strikes (`SS.moves.RELEASE`), and the foot goes to a strike spot fixed when the move starts.
  **Polish round (Bryan's picks, 2026-10-03):** every move now turns the body about the
  pelvis where the clip holds it this frame. It used to be the bind pose's pelvis, 1.3 m
  higher, so every lean also slid the body: a keeper's full dive slid back inside the post.
  **Tackles** are a move, not the stock dive clip (whose own motion drove the defender at the
  camera): each tackler lunges head first at the carrier, arms wrapping round their chest
  (`aimBody` aims from whatever pose the swim clip has them in); the winner may start a
  couple of metres off, so the lunge goes all the way and the ball stays on the carrier until
  the hands close on it; the carrier is knocked back, reaching after the ball. A carrier who
  **breaks a tackle** barrel-rolls out of it, swerving away from the nearest tackler. A **pass**
  is a one-arm push (the ball drawn leaving the hand, eased out over its flight, `passFx`);
  the teammate, or a defender **intercepting**, reaches for it with both hands and pulls it in
  (`catch`; an interception lunges too); a defender who blocks a pass gets an arm to it.
  **Crowds** (Bryan: "a defender stood on a passer"): each body is a head-to-feet line;
  two closer than 1.05 m *as the camera sees them* (flattened onto the view, so one in front
  of the other counts) are nudged apart, eased, at most 1 m, display only (`separate`).
  The ball's player, its catcher, and a shot's shooter and keeper hold still; anyone in a
  contact move keeps their nudge; nothing moves while play is frozen. Left for now: the
  technique banner covers the shot at broadcast size.
  **Later (Bryan):** more animation tuning and polish of the everyday actions.
- **A goal is a moment (M3).** The shot moment flows into it. A banner sweeps right across
  the screen in the scorers' kit (edged in ink and their accent), GOAL! in giant white type
  with an ink stroke (reads on any kit), and under it the scorer and the new score
  (`hud.goalBanner`, 3.4 s). The net bursts (`world.goalBurst`): ~140 bubbles out of where
  the ball went in, a ring of the team colour across the mouth, the net lit in their colour
  (one flash that fades, never a flicker), the frame shudders, the crowd jumps. 0.7 s after
  the ball goes in, with Shot Camera on Cinematic, the camera leaves the goal mouth for the
  scorer (`director.js` mode `goal`, 5.2 m pushing in to 3.6 m, the scorer low in the frame
  so the banner never covers the arms). The scorer turns to the camera and celebrates
  (`moves.js` celebrate: arms up in a V, a twirl, two fist pumps) while nearby teammates
  cheer. The sim's own pause after a goal is 3 s; the kickoff waits until the celebration
  has played out (`GOAL_MOMENT`, 3.6 s from the goal - Bryan had it shortened from 4.5 s;
  the clock is stopped then anyway).
  Then the one cut in the game, to the wide view, so nobody is seen jumping back to their
  kickoff places; the camera eases back in at the kickoff.
- **The goal again: the replay (M3).** `js/replay.js` records the SCREEN, not the match:
  30 times a second of live play, every swimmer's place, heading, lean and every bone, and
  the ball (~7 MB ring, 10 s), because the throw, the kick and the keeper's dive exist only
  on screen (moves.js). Nothing is recorded while play is frozen, so a replay never stops
  for a choice; the ring is cleared at every kickoff. After the celebration (setting **Goal
  Replays**, default On) a wipe in the scorers' colours covers the cut into it; the
  build-up replays at 55% speed (`REPLAY_LEAD` 1.8 s of it), the shot at the pace it was
  seen (already slow), the net bursts again (no ring: the camera is right at the net), then
  1 s more. A REPLAY tag with a red dot sits top left (the info row makes way) with "Press
  to skip". Camera `replay`: tighter than live (`REPLAY_HALF` 4.2), lower, and a little
  behind the attack, still from our side. **Any press skips it** (live play's press goes
  to `openHuddle`, which skips instead while a replay is up; hold Enter still pauses), and
  a second wipe covers the cut to the wide view for the kickoff. Pause or the Huddle in
  the middle of a goal moment comes back to the same camera (`toLive`).
- **The kickoff sweep (M3).** After Kick Off, the camera (`director.js` mode `intro`, a
  Catmull-Rom spline through keyframes, timed by `game.js` so Pause holds it) dives from
  the wide view into the pool, low past our lineup (our plate slides in bottom left:
  name, round badge, "You · Normal formation"), across past theirs (bottom right, diamond),
  and lands where live play starts. 6.5 s; everyone waits in their places until the last
  1.4 s, which are the sim's own kickoff count, so the whistle goes as the camera lands.
  The plates follow the camera's place on the path, not the clock. The second half gets a
  3.6 s drop from the wide view with a "Second Half" plate and the score, and the sim's
  half-time break is run through in ticks first (`startSecondHalf`), so nobody is seen
  drifting and then jumping to their places. No sweep after a goal (the cut to wide does
  that job) or on a resumed save. **Any press skips it** (no Huddle).
- **Halftime and full time (M3):** behind the card the camera circles the outside of the
  sphere, a lap every two minutes (`director.js` mode `orbit`), starting from wherever it
  was, so the pool shows life round the card; the second-half drop starts from there.
- **Technique flourishes (M3).** A technique's name in giant type on a slowly turning
  burst of its colour, who used it under it (`hud.techFlourish`, 1.9 s), and a sparkle
  burst of the same colour round the player, its ring facing the camera
  (`world.techBurst`). One colour per family, so they can be learned by colour: stings
  violet, snoozes sky blue, wilts gold-brown, Beamin' Blasts yellow, the rest their own.
  A technique shot holds 0.5 s (`TECH_PRE`) before the wind-up, so the name is up before
  the ball flies.
- **Later (Bryan, 2026-09-30):** a cinematic camera for shots (cut in on the shooter, follow
  the ball to the keeper), and custom animations for the shooter's shot, a defender's block
  and the keeper's save attempts. Build the moves the `rig.js` way (canned clip + per-frame
  limb overrides), with the 6-angle contact sheet for review. Not before M3.

## A decision on the scene (`js/game.js`, `js/worldui.js`)

- The camera cuts (eased) to a side view fitted round what the choice is about; the action
  sits in the lower 60% so the choices above the carrier cover nobody.
- **One cluster** beside the carrier, tail pointing at them: a heading ("Point blank!
  Right in front of goal") over plates - Pass · Shoot · Dribble · Tech · Keep Swimming - each with its odds
  as a bar, a shape (▲ ● ▼) and a word. One element laid out by CSS, so plates cannot overlap.
- **Pass is two-stage**: the brackets step through the teammates themselves, their badges
  carry the odds, a dashed lane runs to the lit one and every defender in the lane gets ✕.
- **Tech** lists technique moves; a technique pass then goes to the teammate stage.
- **Defend** (Attack and defense stops): Tackle · Block · tackle techniques, under "#4 Duke
  will likely pass", worded against each other (see the open questions).
- Our team always attacks to the RIGHT; teams differ by badge shape (round / diamond) as
  well as colour.

## Broadcast (`js/broadcast.js`)

Three original characters - an announcer ("Stadium"), a play-by-play caller (Rip Tidewell)
and an analyst (Coral Banks). The script is `content/voice-lines.json` (off the site; built into
`js/voice-lines.generated.js` by `tools/build-voice-lines.cjs`). Every line is captioned with
the speaker's name. Lines queue so a goal call, the score and the reaction are all heard;
chatter is dropped rather than queued; per-speaker cooldowns stop droning. Commentary speaks
only in live play and never over the interface. **Voice slot:** a line id listed in
`audio/vo/index.json` plays that clip instead of the system voice - no game changes needed.
Setting: Full broadcast / Big calls only / Captions only / Off.

**To fix in the audio pass (Bryan, 2026-10-02):** stale lines. Lines about an earlier play
still sit in the queue and come out late - "Picked off by Moku!" and "You can't throw it
through traffic like that." were heard during a goal celebration. A queued line should be
dropped once play has moved past it (a goal, a save, a change of possession), so the call
always matches what is on screen. Fix it with the voices, not before.

## Sound (`js/audio.js`, M3)

Every sound is a WAV made offline by `node tools/generate-audio.mjs` (synthesised, no
recordings; `audio/README.md` lists them). Bryan picked each in listening rounds on
2026-10-03, three options at a time (the round pages and scripts are in
`Projects\Assets\SphereSplash\sound`), after a look at how Ari's games do it: Robot
Football's offline-generated files were the model, P3GL's gapless loop player plays the theme.

- **Crowd:** a murmur under every match ("behind the glass": Robot Football's noise-voice
  crowd, darkened as if heard from inside the sphere), with a sung "ooh" as a shot goes in, a
  roar for a goal and an "aww" for a save or a blocked shot. The sung reactions have no noise
  in them at all: M2's noise crowd came out as static over the commentary.
- **Match sounds:** the "underwater" set - bloops, soft thumps, bubble trails - for the
  whistle, pass, catch, shot (on the release, not the wind-up), tackle, block, save, goal, tech
  move, a decision, and the menu's move and select. The pause hold keeps M2's rising ticks.
- **Music only on the menus, halftime and the results card** (the "island" theme: steel drum,
  marimba). During play the crowd and the commentary carry it. Stings (the "anthem" set, synth
  brass) for a goal and at full time: a win, or a kind "nice try" for a loss or a draw.
- **Speech has the floor:** the crowd drops to 28% and the music to 30% while the menu voice or
  the commentary speaks (Robot Football's and P3GL's levels); effects start at 65%. The pause
  ticks never duck. Pause, its questions and Settings quiet the crowd.
- **Settings:** Sound Effects, Music, Crowd - each on or off, all on by default.
- All through SafeAudio and plain `<audio>`; never an `AudioContext` (ACCESSIBILITY.md).
  Browsers hold sound until the first press, sometimes silently (Firefox pauses an element that
  turns audible), so every press or tap restarts anything that should be playing.

## Motion and themes (M3)

Bryan's picks (2026-10-03), after a look at Ari's games (Fish Mystery's themes, Ballista's
and Robot Football's motion settings):

- **Motion: Full / Reduced** (Settings). Until the player picks, it follows the device's own
  reduce-motion setting, live (`util.reducedMotion()`; Ballista's way). Reduced:
  - the shot camera is always Steady (Shot Camera shows locked, "Motion is Reduced"), so no
    shot or goal camera moves;
  - no kickoff sweep: the wide view holds while the team plates show, then cuts in; no camera
    travel to the menu, halftime or wide views (cuts), and the menu and halftime views stay
    still instead of circling;
  - the goal net does not shudder and flashes half as bright; the crowd neither sways nor
    jumps; bubble bursts have a third of the bubbles, slower;
  - cards, banners, plates and the tech flourish appear without sliding, bouncing or
    spinning, and the highlight frame does not breathe (`body[data-motion="reduced"]` in
    ss.css); the replay wipe fades instead of sweeping.
  - Kept: live play's camera following the ball, the ball trail, the shot's slow motion, the
    swimmers' own moves. They are the information, not decoration.
- **Colour Profile: Standard / High Contrast** (Settings), High Contrast covering the whole
  game. Fish Mystery's way: `body[data-theme]` picks a block of CSS tokens in ss.css; the cards
  use them directly, and the 3D world reads the `--w-*` ones through `js/theme.js` (palette(),
  repainted on change: world.js water/fog/sky/stadium/goals, models.js outlines, game.js ball,
  trail, pass lane). Role tokens (`--hi`, `--dark`, `--stroke`, `--on-focus`) let a profile
  recolour by meaning. High Contrast is Bryan's pick D of four picture options: black behind
  everything, white lines and text, pure yellow highlight with black text, no gradients or
  soft shadows; no stadium or crowd behind the water (the water is opaque black, a touch lighter
  above); swimmers keep their cartoon shading inside a thicker white outline (flat, unshaded
  swimmers merged into one shape where bodies overlapped); white ball on a yellow trail.
  Round sheet: `Projects\Assets\SphereSplash	hemes
ound1`.

## Saves (`js/save.js`)

`ss-settings` (this game's settings) and `ss-match` (the sim snapshot, saved at every
decision, at halftime and every 5 s of play). Continue restores the exact moment. Hub access
settings (Auto Scan, scan speed, voice) belong to the shared managers, not here.

## Checks

- `node tools/check-sim.cjs [--quick]` - the rules (M1).
- `node tools/check-voice.cjs` - the voice slot contract; passes with no recordings.
- `node tools/check-audio.cjs` - every sound file exists, is the right format, never clips;
  the theme's loop tail and seam are right; the package stays under 8 MB.
- `node tools/check-firefox-sound.cjs` - Firefox (Bryan's browser) from file://, with its normal
  autoplay rule and real key presses: the theme starts on the first press, loops, and gives way
  to the crowd in a match. Chrome runs check-browser with autoplay allowed, so only this sees
  Firefox holding a sound that fades in from silence. Skips if Firefox is not installed.
- `node tools/check-browser.cjs` - the real game in headless Chrome with real key events: cards
  fit at 1920x1008 / 1368x840 / 1024x768, clock and swimmers frozen at every decision, plates on
  screen and never overlapping, Huddle, hold-to-pause, Auto Scan with Enter alone, save and
  resume, a whole Quick Game, and commentary never spoken over a choice. Sound: the theme on
  the menus and its gapless loop, the crowd in play and quiet under Pause, the crowd ducking
  under speech, the Crowd and Music settings, the full-time sting and results music.

## Open questions for the playtest (tune by feel, not by count)

- **The dead time at the goal is gone; the pace has doubled.** Bryan saw "long periods of no
  activity ... near the goal". A carrier who got the ball at the goal (point-blank already
  used by a teammate) sat pinned against the goal's keep-out, keeper pressed against them,
  until the catch's 8 s GRACE ran out: ~16 times a Quick Game, 6.7 s median, and half of
  all carrying time. Now (`sim.js`): at the keep-out there is no grace, so the keeper
  challenges at once, and a carrier with nobody able to challenge gets Shoot / Pass. Zero
  stalls in 30 Quick Games. But that dead time had been holding scores down: a Quick Game
  (Attack and defense) went from ~2.2 goals and ~31 stops to ~5 goals and ~52 stops. A
  shorter GRACE does not change the scoring (tried 2-8 s). `check-sim` still expects the
  old pace; **Bryan played it and kept the new pace** ("the pace seems ok"), so its ranges
  are now 6-16 goals a full match and 40-130 stops (Our ball only).

- **The 14 m shot chance is gone (Bryan, 2026-09-30).** It came ~1.5 s after every kickoff
  (the kickoff swimmer starts 18.4 m out), and from 14 m a shot almost never scores: SH ~18
  loses 1.5 a metre, so 55% fell short and 99% read Risky in every tuning tried. A stop whose
  answer was always Keep Swimming. Point-blank stays; the earliest one now comes ~4.3 s after
  a kickoff, only when the kickoff swimmer reaches goal untouched (~5% of them). Stops per
  Quick Game did not change (~44): carriers swim on into real encounters instead.
- **Shot odds and keeper strength, assessed (2026-09-30).** The odds are right: they are the
  same `resolveShot` played out 160 times. What made point-blank read Risky was the
  **player's team**: the Beamers (SH 18, 15 at best) shoot at keepers with CA 16-21, so an open
  point-blank shot scored 6-14% and the Beamers won ~3% of Quick Games even choosing well
  (~23% at M1; the M2 playtest fixes and the goal-mouth fix tipped it). Loosening shots for
  everyone (SHOT_DECAY 1.0 / 0.8, a keeper slower to react up close) doubled or tripled the
  goals and helped the strong clubs most (Beamers 0-7%). **Bryan chose a Difficulty setting**
  that boosts the player's team: Beamers win ~80% / ~40% / ~20% on Easy / Normal / Hard
  (sensible choices, `check-sim` 4b). Open point-blank shots still mostly read Risky on Normal;
  judge in play whether that feels wrong now the team can win.
- Decision count per Quick Game: ~52 with Attack and defense since the goal-mouth fix (was ~30),
  ~16 with Our ball only before it. **Attack and defense is now the default** (Bryan, after his first
  full game had no defensive choices); settings saved before that forget their old default.
- **Defending choices no longer read "Risky / Risky".** The heading says what the carrier
  will likely do ("#4 Duke will likely pass"; "may pass or dribble" under 55%). Each
  plate says what it stops (Tackle: a dribble; Block: a pass or shot), and the odds words
  compare the choices: Best bet ▲ / Close ● / Weaker ▼, or Even ● for all when they are
  within 10 points. The bar still shows the real chance of winning the ball. In play the
  likely move is at least 74% certain nine times in ten. Bryan asked for it short, for
  switch play and speed.
- Bryan played it (2026-09-30): the words help; he asked for more to see, for low vision.
  Every plate's odds bar is now full width and twice as tall, the word sits on a pill of
  the bar's colour (green / amber / red, dark ink, ▲●▼ kept; a white ring on the highlighted
  plate so amber does not melt into the yellow), and the Best bet plate wears a green star
  tab and ring. Attack plates have no star: their words are absolute, so two can both be
  Good chance.
- **Formations matter; now the game shows it** (Bryan chose: show the shape, the analyst
  reacts, opponents change too). Beamers v Raiders (80 matches): Normal wins 4%, All-out
  Defense 30%, Left Side 0%; over all 30 pairings no formation dominates (1.19-1.67 points a
  match, Normal 1.51), so the right one depends on the opponent.
  - Picking a formation: play resumes framed on our team, with a ring at each fielder's new
    spot, a dashed line to it, and the analyst saying what the shape does.
  - The CPU coach (`ai.coachPick`, in the sim so it saves and replays) reviews about once a
    minute and at halftime: chases the game when behind late, protects a lead, otherwise
    sometimes tries a shape - ~4.5 changes a full match. The analyst announces each one;
    the HUD shows both teams' formations.
  - The analyst judges a formation once it has had 45 s: struggling (conceding shots or
    goals), working (making them) or holding (no shots against for a minute).
  - The Formation card shows how ours has gone ("Normal for 1:20 · 3 shots for, 1 against")
    and what they play.
  - Flat Line (unlocked at 25 wins) is the weakest - an unlock should never be a trap (M4/M5).
- Sound: every M2 sound is now a clean tone. The noise-based crowd roar / "ooh" and the pass
  swish came out as static over the commentary (Bryan's M2 note) and were removed; a real
  crowd is M3's. (Done in M3: see Sound.)

## Modes (`js/modes.js`)

Quick Game / Simple Season / Full Season are **presets of individual toggles**; every
system reads its toggle through `SS.modes.rules(season)`, never the mode name.

## Balance (measured by `node tools/check-sim.cjs`, 600 matches)

~7 goals, ~19 shots, ~47 encounters, ~32 possession changes per match; 78% of passes
complete. The two strong clubs (Harbor Stars, Mistwood Monarchs) win ~90%; the rest win
16-36%; the Bayside Beamers (the player's underdogs) win about a quarter. Picking good odds
clearly beats picking bad ones. *(M1 numbers. Since the goal-mouth fix, ~11 goals and ~65
encounters a match, and CPU Beamers win ~1%; the player's Beamers rely on Difficulty.)*

Tuning history worth keeping (each was a real failure the checks caught):
- Encounters re-fired the moment a cooldown ended because chasers out-swam the carrier →
  new carriers get a grace period, and only a defender **in the path** can engage.
- Blocking defenders stopped every pass regardless of direction → block stance widens and
  strengthens *lane* blocks; it does not block passes away from you.
- A single technique decided matches (Spin Shot / Super Save; see `tools/ablate.cjs`) →
  technique bonuses are 60% of FFX's, and the shot-vs-keeper roll is deliberately wide.
- Carriers circled the goal because they steered away from the keeper → they no longer
  do, and bend less the nearer the goal gets.
- Swimmers piled up inside the goal (Bryan's M2 note) → a **keep-out ball round each goal**
  (`GOAL_KEEP_OUT`, centred `GOAL_KEEP_BACK` behind the frame) that only that goal's keeper
  may enter, and a loose ball is nudged out of it. First try stalled whole halves: a carrier
  who had used the point-blank chance waited at the zone's edge, where no defender can get in
  front of them. Re-arming the chance on every catch fixed that but doubled the stops →
  instead **the keeper comes out to meet a carrier at the edge** (the goal-mouth encounters
  M1 had, without the pile-up). Balance back to M1's (~6 goals, ~50 encounters, ~52 stops).
  `check-sim` now also fails on any 45 s of live play with nothing happening.
- Off-ball swimmers sat still 61% of the time and "spun in place" (Bryan's M2 playtest):
  idle swimmers turned every frame to face a fast-moving ball (46-92 degrees a second). Now
  every fielder drifts on a slow loop round their spot (`WANDER` in ai.js, clock-driven so
  it replays exactly), and turning is rate-limited with a dead zone (`face()` in game.js):
  fielders tread 11% of the time, treading turns average 16 degrees a second. Balance unchanged.

## Assets

Swimmers: Quaternius Universal Base Characters + Universal Animation Library (CC0),
bundled by `tools/build/prep-models.mjs` into `js/model-data.js` (base64 GLB, textures
stripped, toon colours painted by bone). The "chunky" body style (`STYLES` in
`js/models.js`, Bryan's pick of four in M3) sculpts the bind pose once at load: head
x1.35, hands x1.6, feet x1.5, thicker limbs and chest, so no bone or clip changes. The
ink outline holds 2.5 px on screen at any distance (it was ~1 px at match distance).
Team look (M3 round 2, Bryan's picks): a full suit (main colour on the legs, accent on
chest and arms) and a water-polo cap in the main colour. Gear says the role by shape:
forwards (LF, RF) a bracer with a fin on each forearm; defenders and the midfielder two
pads on the backs of the shoulders (a pad on top of the shoulder tucks in beside the cap
while swimming and vanishes); the keeper wears the team's colours with water polo's red
cap and big white gloves. All gear is one skinned mesh per swimmer (`buildGear`), so 12
swimmers cost ~103 draw calls of the 150 budget. Teams whose looks read as one meet in an
away kit (`CLASHES` + `alt` in data.js: Stars gold/navy v Horns, Gliders dark brown v
Beamers and Raiders, Monarchs dark plum v Horns); the Beamers never change. With that,
all 15 team pairs measure >= 20 (CIEDE2000, rendered in the water at 11 m; ~±3 run to run).
Every cap carries the team's ornament as a pair in the accent colour (keepers too), from
the team's `badge`: Beamers a sun, Stars a star, Raiders a shark fin, Gliders a cog,
Horns real horns, Monarchs a leaf. Bryan placed them on the sides of the cap, up and back
clear of the cheek and neck (`CREST_UP` / `CREST_BACK`), flat shapes facing sideways so
the side-on camera sees the whole shape; sizes in `CREST_SIZE` / `CREST_SCALE`.
The ball carrier glows: a gold band outside their ink outline, white on yellow and orange
kits where gold blends in (`setGlow` / `glowFor`, Bryan's pick
over a disc of light behind them, which was faint at decision distance). A loose ball
draws a trail (`world.makeTrail`): a solid gold ribbon, white at the ball, 4.5 m of PATH
(not seconds, so slow motion keeps it), built from where the ball is drawn so replays get
it too; it shrinks into the hands on a catch. Glowing (additive) light washed out against
the bright water, so it is solid colour. Revisit both with the Motion setting.
Checklist round 5 (Bryan, 2026-10-02): the Stars and Horns sit below 20 against the
blue-teal water (12-18); lighter/deeper shades did not help and broke other pairs, and
Bryan accepted it - the thick ink outline carries their shape. High Contrast is checked
with the themes step (the game has no themes yet).
The pool (M3, round 1 of the stadium/water step, Bryan's pick B of four): the inside of
the sphere's skin is the water's own colour, so it is the backdrop of every play - a light
haze (55%) that softens the stadium's striped tiers behind the swimmers (background
detail about half of before) while still showing the stadium as soft shapes, teal rather
than blue, bright toward the top and deeper below so up and down read. From outside the
near skin stays glass and the far side is the same water, so the sphere reads as a ball
of water. Teal measured better than blue for the kits: swimmers below 20 against the
water behind them went from 5-7 of 27 kit/role combinations to 2 (Stars' forwards and
defenders, 18-19). Review sheets in `Projects\Assets\SphereSplash\pool`.
Goals (round 2, Bryan's pick C of four): the mouth is unchanged (RULES.GOAL_SIZE), the
frame is one thick rounded tube with the swimmers' ink outline, lit from within so it
stays bright in the haze, and the net has a visible diamond mesh. Each goal wears the
match colours of the team that DEFENDS it (`world.setGoalKits`, from game.js), so you
shoot at the goal in the other team's colours; a goal flashes the scorers' colour.
The arena (round 3): Bryan chose variety over one pick - any stadium at any time of day,
picked at random each match (Settings: Stadium and Time of Day, each Random or fixed; a
fixed choice shows at once, Random waits for the next match). Three stadiums
(`world.STADIUMS`: Floodlight Towers on a ringed cradle, Stone Arches with flags, Lamp
Ring on a cup) x three times (`world.TIMES`: day with clouds, sunset, night with stars
and phone lights). A time of day only shades the building and turns its lights on; the
swimmers' lighting never changes, so the kit colour work holds in every arena. Fans sit
at the end of the goal their team defends, in its colours. From inside the water the
crowd melts into its seats (`uCalm`, from the camera's distance to the centre, so it
changes while the kickoff sweep passes through the skin): the crowd was nearly all of
the background busyness behind play, and every arena measures calmer than the old
stadium (0.45-0.59 v 0.87, mean L* gradient of the swimmer-free frame). The arena is
saved with the match (`setup.arena`) and the last one is the menu's backdrop.
Water life (round 4): no ambient decoration. Bryan: "Visibility is most important so if
anything adds visual clutter or noise it's best to dial it back or remove." The caustic
light pattern (on swimmers and goals), 420 drifting bubbles and seven swaying light shafts
were measured with the swimmers and camera frozen: they were the only moving thing behind
play (mean frame-to-frame L* change 0.19 live, 0.27 in a shot close-up, against ~0.003
without them), and a softened version still moved. None helped read the play - the
water's own gradient already shows up and down - so all three are gone. Bubbles stay
where they mark an event: the goal and technique bursts.
Speed (round 5; target 60 fps on Ben's Surface Pro). Nothing that helps Ben see is ever
turned down: the one lever is the pixel ratio (`js/main.js`, steps 0.66-2, capped at the
screen's own). Every 2 s: under 54 fps drops a step (two under 30), over 58 fps twice
running steps up. A step up that drops back within 6 s has failed and waits 1, then 2,
4... minutes before another try, so the picture does not keep flicking sharp and soft;
a sample under 10 fps is a stalled window and is ignored. Checked on a simulated
fill-bound Surface (render cost per megapixel): it settles one step down and retries
rarely. CPU: each swimmer's eyes and brows had their own copy of its skeleton (36
posed and uploaded per frame for 12 swimmers, now 12), and each swimmer re-posed its
whole body a second time every frame; with both fixed a frame costs ~7 ms of script at
6x CPU throttle (was ~11). Testing on the device: open the game with `?perf` on the
address (`index.html?perf`); the corner shows fps, draw calls, triangles and the pixel
ratio (x2 = full sharpness on a Surface). Steady 60 at x1.25 or above is the goal.
Characters are judged against a written checklist (team colour difference measured from
rendered frames, outline thickness, squint test) kept with the review sheets in
`Projects\Assets\SphereSplash\characters`. Custom motion is layered on the clips in
`js/rig.js` (world-space two-bone IK; the carry-swim is the first user). Three.js r155
(the hub's copy) plus GLTFLoader/SkeletonUtils from three@0.155.0, bundled by
`tools/build/bundle-addons.mjs`.
