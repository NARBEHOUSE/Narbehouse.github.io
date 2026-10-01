# ROBOTFOOTBALL

An original 3D robot football game for Benny's Hub, playable with one or two switches. Open `index.html` through the hub or directly in a browser with WebGL enabled. The engine, models, textures and sounds are bundled locally; no account, CDN or build step is required.

Every play begins overhead with a scanned playbook. After selection, both teams line up before the camera moves into the action. Receivers continue their routes while you scan their on-field badges. There is no selection timeout, game-clock advance or automatic failure while choosing a pass. All 22 robots have assignments. A catch hands control to the runner after a protected reaction window. On defense, steer your robot toward the ball carrier to tackle automatically at close range.

Completed plays stay on the field long enough to see the tackle and outcome, with a colour-coded banner: gold for scores, green for good news, red for trouble. Speech lets every scene breathe. The outcome stays on screen until its speech has finished, plus a short pause (never more than nine seconds), before the next menu. Play-by-play lines queue behind the one being spoken instead of cutting it off, and lines the next screen repeats are skipped. Scanning and selections always speak at once. The overhead playbook then returns by itself with the last play shown at the top, so a play costs one selection instead of two. The next play still waits for your selection.

## Basic and Advanced

**Game mode** in Settings picks **Basic**, the default for a new player, or **Advanced**. Basic is built like Benny's Football: few settings and fewer small decisions, so a game is mostly calling plays and making them. Advanced is the full game with every option.

In Basic:

- Settings lists only Sound effects, Text to speech, Voice, Auto scan, Scan speed, **Easy throw**, Large text, Game mode and Reset saved progress. Easy throw is the charge setting seen the other way round, as in Benny's Football; it starts Off, so throws and kicks are charged. Voice and the scan rows stay because a game opened outside the hub has no other way to reach them.
- Everything else plays at fixed values: Rookie, Relaxed, Hold to steer, crowd on, Standard kick-aim speed, kick guide on and kickoffs on. Camera motion follows the device's reduced-motion setting. The player's own Advanced choices stay saved and come back in Advanced.
- The game makes the small calls. The coin toss is tossed for you: the game calls heads or tails, shows and says the result, and holds the kickoff until it has been heard. When you win, you receive. When the visitors win, they choose as usual: they defer in a season game, so you receive, and they receive in an exhibition. Overtime tosses the same way. Your kickoffs are always deep, with no kickoff menu, and punts go straight down the field with no aim to sweep. The extra point or two-point choice and the end-zone return choice stay.
- The pause menu is Continue, Help, Game status, Settings and Main menu. How to play leaves out the coin toss calls and the hidden settings.

Changing Game mode takes effect at once, mid-game too. The settings list rebuilds with focus kept on Game mode, and a game paused or saved at the coin toss is tossed for you on Continue. Saves load in either mode.

## Scoring and pursuit

A touchdown is worth six points. The player then chooses between **Kick the extra point** (+1, a short kick from the 15) and **Go for two** (+2, one run or pass from the 2-yard line against a goal-line defense). The visiting coach kicks, but goes for two when the score calls for it; the player defends that try. Conversions are untimed downs and always happen before a period ends.

## Coin toss and kickoffs

Kickoffs follow the classic rules. A coin toss opens the game: call **Heads** or **Tails**. The winner of a four-quarter season game chooses **Receive** or **Defer to the second half**; in an exhibition, which has no halves, the choice is **Receive** or **Kick off**. When the visitors win, they defer (or receive in an exhibition). The team that did not receive the opening kickoff receives to start the second half, and overtime opens with a new toss.

Every half and every drive after a score starts with a kickoff from the kicking team's 35. After a safety, the team that gave it up punts a free kick from its own 20. A touchback puts the ball at the 25. The kicking team lines up across the field a yard behind the ball on an orange tee; the receiving team sets two deep returners, a front line ten yards off the ball and blockers who drop back into a wall while the ball is in the air. The game clock waits while the kick is in the air.

Your kickoff has no aim to sweep. Hold Enter and the charge line grows from the tee toward the receivers' goal line, the same way as a field goal; let go when the tone plays and the kicker runs up and boots it deep. A full charge usually lands in the end zone for a touchback; a soft one lands short and can be returned a long way. With **Charge throws and kicks** off (**Easy throw** on), the kickoff kicks itself a moment after it is announced. It lands inside the visitors' 10 for a return, and about one kick in ten carries into the end zone for a touchback. When you are behind, **Onside kick** is offered: a short kick your robots try to get back, about three times in ten on Rookie. The visitors try one when they trail late in a season game.

On the visitors' kickoff, a kick caught in your end zone stops the play and waits for your choice: **Run it out**, which comes first so a stray press never gives up a return, or **Take a knee** (a touchback at your 25). Anywhere else your returner runs it back like any other run, steered or on auto. On your kickoff, you cover like on defense: the robot nearest the returner is yours, and the visitors' returner takes a knee on most deep kicks. A returner downed in his own end zone after a kick is a touchback, not a safety, and return yards do not count toward total yards. **Kickoffs and coin toss** in Advanced settings can turn all of this off, and then every drive starts at the 25 as before.

Defenders take pursuit angles and aim where the runner will be. Pursuers close in on the runner rather than shadowing him, trailing defenders dive at the runner's legs, and blocks are shed after a moment. A runner's servos heat up on a long run, so pursuit can close in the open field. A defender who reaches the ball carrier tackles him, including one who is still tangled with a blocker. Only now and then does a runner shake one off. That defender is knocked back to the turf, gets up and can chase again. Robots are solid on every play, while routes run, on handoffs, kickoffs and returns as well as with the ball carrier, so nobody passes through anybody. A low pass that meets a defender's body is knocked down instead of flying through him. A tackled runner is spotted where he was hit (forward progress), not where the fall carried him. In Practice, contact knocks defenders away instead of tackling. The player's own defender's tackles always hold.

The robot you control is marked **YOU** at its feet: your ball carrier on offense, your defender on defense. When no button is pressed, he plays himself with a goal, and the marker reads **AUTO**. An auto runner follows his called lane, then finds open grass: he leans away from free defenders ahead, ignores defenders tied up in blocks, and stays off the sideline. An auto defender pursues the ball carrier, rushes on a blitz and covers the nearest receiver before the throw. Pressing a switch takes over at once; a brief beat after you let go, he plays himself again. On defense, control never switches while you steer. After three seconds hands-off, it moves to the robot nearest the ball carrier. When a run or catch begins and you are not steering, you start on the robot nearest the ball. The visitors' runner uses the same open-grass reading instead of weaving at random. Every camera looks up the field from the player's own side, on offense and on defense. The overhead playbook view is close in on the ball, and the live defensive view keeps your robot and the ball carrier in frame together. Deep throws are harder to complete than short ones. Rookie stays forgiving; Pro plays tighter coverage and faster pursuit. Practice has no drops, interceptions or tackles that break your runner's run, but a mistimed throw still misses.

## Throws and kicks

With **Charge throws and kicks** on (the default), hold Enter on a receiver and a bright line grows from the quarterback toward him. It is yellow while it grows. As it reaches his hands it turns green, slows down and a tone plays. If you keep holding, it turns red and runs on past him. Let go on green for a good throw. As in the classic game, a pass can only be caught when it is let go on green. Let go early and the ball comes down short, where the line ended, and falls incomplete ("Thrown short"); only a ball that lands within about a yard of him can still be caught, diving, and a defender sitting under an underthrown ball can pick it off. This timing counts in Practice too, which still removes drops and interceptions on good throws. Holding through red is an overthrow, and a full charge throws by itself. While the line grows, only the chosen receiver's tag stays bright, and it moves under his feet out of the line's way. With the setting off, releasing Enter throws or kicks at once. A mouse or finger held on a receiver tag or the Kick button charges the same way as a held Enter; while charging is on, a plain click does not throw or kick at full power.

Field goals and extra points are place kicks. A holder kneels seven yards behind the line with the ball up on its point under a fingertip, and the kicker stands three steps back and two over. Hold Enter and the line grows toward the uprights; the tone marks enough leg for the distance. A long field goal needs the full line, an extra point very little. On release the kicker runs up and boots it about a second later, at any pace setting. The visitors' field goals and extra points use a holder too, and you can see them line up before you pick a defense. The aim starts at a far post, so you sweep it toward the middle. With **Kick guide** on, the uprights glow and a soft ping and "On target" sound while the aim is between them. Longer kicks narrow that window. Punts have no holder.

## Low vision

Receiver tags show a large number and a coverage word with the depth in yards: OPEN in green, COVERED in yellow, TIGHT in red. Scanning a receiver says his number, his coverage and where he is. Coverage reads are real and they hold still long enough to act on. Each receiver's defender lines up at the snap in the coverage he will play (pressed, three and a half yards off, or a soft six yards off) and keeps that distance for four to seven seconds before stepping to the next (open, covered, tight, one step at a time). The read is measured from the defenders actually on the field, so what you hear is what you see; a defender only passing by counts once he stays near, and a receiver is never called more open than every defender near him allows. Choosing a receiver keeps his defender where he is for three more seconds, and charging a throw to him keeps him there until the ball is gone. The catch chance follows the read. If his coverage changes while he is chosen, the game says so. The playbook reads the down, distance, field position and score, and the pause menu's **Game status** item reads the score, the down and the last play. Kicks announce their distance. On defense, taking over a new robot says its number. **Large text** in Settings enlarges the menus, scoreboard and field labels. The referee's whistle after each play is a short, soft tweet.

## Controls

| Context | Two switches | One switch / Auto Scan |
| --- | --- | --- |
| Menus, plays and receiver badges | Tap Space to scan; release Enter to select | Highlight advances at the hub's scan speed; release Enter to select |
| Punt / field-goal aim | Hold Space to move aim; release to stop; press Space again to reverse; hold Enter to charge, release to kick | Aim sweeps automatically; hold Enter to charge, release to kick |
| Scan backwards | Hold Space | Optional Space support |
| Run / defend, Hold to steer | Hold Space left; hold Enter right | Hold Enter toward the armed direction; release swaps the armed side |
| Run / defend, Choose direction | Scan/select left, straight, right, or Pause | Enter selects the automatically scanned option |
| Pause | Select Pause / settings in the playbook between plays, or Pause while choosing a receiver; holding Enter never pauses | Same; Choose direction also exposes a scanned Pause option |

On-screen controls also support mouse and touch. `Choose direction` freezes movement between segments so a sustained hold or quick response is not required. Receiver selection and kick aiming have no time limit. Advanced settings include kick-aim speed (Slow, Standard, Quick, Fast), Large text, Charge throws and kicks, Kick guide, and Kickoffs and coin toss. Settings are available from both the main and pause menus. Global hub voice and scan settings apply directly. The default movement pace is Relaxed.

## Robots and presentation

The football robots have original beveled armor, integrated helmets and facemasks, visors and joint lights that glow in each team's accent colour, exposed metal joints, mechanical hands and cleated boots. The mech-league stadium has a starry night sky, neon strips along the stands, glowing pylons, beacons and goalposts, laser scrimmage and first-down lines, and hex-plated end zones. Live jumbotrons show the score. Tackles throw orange sparks, broken tackles cyan sparks, the ball carrier leaves a speed trail, and scores set off fireworks over the end zone. Chest and back numbers stay readable, and team colors carry through the armor, stadium endzones and midfield markings.

The ball grip uses articulated shoulders, elbows, wrists and fingers. The football follows the carrying hand through quarterback preparation, running and celebrations. Passes spin around the football's long axis for a spiral. Running strides, catches, throws, kicks, the holder's kneel, tackles and falling poses use the same articulated rig.

Every play has a pre-snap setup, a protected control handoff and gradual acceleration. A tackle has a 1.4-second animation phase, followed by a 2.2-second unobstructed outcome hold before the result controls appear. These presentation delays use real time independently of movement speed.

## Teams and season

| Color | Team | Robot name |
| --- | --- | --- |
| Blue | BLUEBORGS | BLUEBORG |
| Red | RUSTBOTS | RUSTBOT |
| Green | GREENTRONS | GREENTRON |
| Gold | GOLDBOTS | GOLDBOT |
| Purple | VIOLETRONS | VIOLETRON |
| Orange | COPPERBOTS | COPPERBOT |
| Teal | TEALTRONS | TEALTRON |
| Pink | ROSEBOTS | ROSEBOT |
| Navy | NAVYDROIDS | NAVYDROID |
| Black | CARBONBOTS | CARBONBOT |

Player labels combine the singular robot name with the jersey number, such as `BLUEBORG #12`. Receiver speech reads the robot name and number once.

A season contains sixteen games. Ten wins qualify for the Wild Card, Conference and Championship rounds; a perfect regular season advances directly to the championship. Schedules and results save automatically. Stable team IDs and the existing save keys preserve progress when the game and teams are renamed.

Season matches have four two-minute quarters and overtime until an untied result. Choosing a play, scanning receivers, lining up, protected reaction windows and pauses do not consume game time. Exhibition uses four possessions per team. Practice offers no-fail play. Rookie/Pro difficulty, three movement speeds, reduced camera motion, speech, sound and crowd settings are available.

Every play leads with what it is for, like the classic game's playbook, with its own name in small type above: **Short pass** (Quick Slants), **Medium pass** (Sideline Flood), **Long pass** (Four Verticals), **Outside run** (Outside Sweep), **Inside run** (Inside Zone), **Field Goal** (with its distance) and **Punt**. Pass tags are cyan and run tags amber. Scanning a play reads its purpose and a one-line description. The defensive assignments are **Stop the run** (Edge Contain), **Rush the passer** (Blitz), **Stop the pass** (Deep Cover) and **Cover short passes** (Man-to-Man), which presses each receiver: tight on short routes, but a long pass can beat it. On the visitors' fourth down their punt or field goal unit is already on the field when you call, and special teams replace the defense. Against a punt: **Return the punt** (Punt Return) sends a returner deep behind a wall of blockers, and he runs it back as your ball; **Block the punt** (Punt Block) rushes everyone at the punter for a chance to block it, recovered as your ball near their goal, or for a touchdown in their end zone, but if it gets away nobody is back and it rolls on. Against a field goal, the playbook reads its distance: **Block the kick** (Field Goal Block) rushes the kicker, and long kicks fly lower and are easier to block; **Return a miss** (Field Goal Return) waits at the goal line, and a long kick that comes down short can be run back. Blocks are decided by chance, never by reaction time. The last possession of a four-possession game ends with the kick, with no return. Route icons are drawn as the field looks from behind your quarterback. On a blitz, the running back picks up your linebacker for a moment, so steer around him. Rules include the coin toss, kickoffs, touchbacks, onside kicks, first downs, fourth-down turnovers, catches, incompletions, interceptions, bounds, touchdowns, extra points, two-point conversions, field goals, punts, safeties and free kicks. The opponent chooses runs, passes, fourth-down kicks and its conversions. The final screen shows a system log of yards, touchdowns, big plays, broken tackles, sacks and turnovers. The pause menu has a **Help** item that says "I need help" aloud.

Separate exhibition and season checkpoints save at play boundaries. Reloading during action returns to the beginning of that play. Practice does not replace either saved game. Final results advance the season once and clear the match checkpoint. Classic football saves stay separate.

## Verification

Run `node tests/simulation.test.cjs` and `node tests/season.test.cjs` from this directory for deterministic football rules, timing, season progression and persistence checks. From the repository root, run `node_modules/electron/dist/electron.exe bennyshub/apps/games/ROBOTFOOTBALL/tools/test-ui.cjs` for the hidden-window browser smoke test. `--tablet-only`, `--season-only`, `--conversion-only` and `--basic-only` run shorter subsets. The full run plays Advanced, then finishes with the Basic checks. The robot presentation harness is `tools/test-robots.cjs` and captures robot poses and ball grips.

Browser checks exercise actual page input, on-field selection, kick-aim reversal, protected handoff, pause/settings, one-switch controls, team selection and season save/result flows. Reports and screenshots are written under `tools/test-output`; isolated browser profiles are under the repository's `tmp` directory. Playtesting with the intended switch user remains useful for physical-switch comfort, speech intelligibility and sustained-session performance.

## Code and assets

- `js/simulation.js`: football rules, assignments, pursuit and state transitions. `TUNING` and `ROLE_SPEED` hold the difficulty balance.
- `js/season.js`: robot team metadata, validated season storage, schedules and postseason progression.
- `js/robots.js`: shared procedural armor geometry and articulated robot rigs.
- `js/renderer.js`: stadium, cameras, animation and football presentation.
- `js/ui.js`: menus, shared accessibility integration, switch input and persistence.
- `js/audio.js`: sound lifecycle and crowd ducking.
- `tools/generate-audio.mjs`: reproducible offline WAV generator.

The browser entry point is `window.RobotFootball`; `window.BennyFootball` remains an alias for compatibility. Three.js is bundled from the hub's local engine and retains its MIT license header. The game uses original procedural models and art. Original PCM effects and stadium crowd audio play through HTML audio; see [audio provenance](assets/audio/README.md).
