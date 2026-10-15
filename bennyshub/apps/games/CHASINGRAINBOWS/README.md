# Chasing Rainbows: Switch Access Edition

This is Inclusive Imagination's weather card game, played with one or two switches. It uses
the real card art and opponents, with the October 14 partner feedback below applied to the rules. Everything is spoken and nothing is
timed. One to six people can share the switch, with or without computer players.

The design and every rules decision are in [SPEC.md](SPEC.md). How the game is adapted for
switch players is in [README-ACCESSIBLE.md](README-ACCESSIBLE.md). Who owns what is in
[NOTICE.md](NOTICE.md).

## Copyright and open-source license

**The implementation code is open source; the original game content and artwork
are separately protected.**

| Material | Ownership and permission |
| --- | --- |
| NARBE's original game engine, interface, accessibility code, tests and tools | © 2026 NARBE LLC; MIT License |
| Original Chasing Rainbows game content, protected rules text and branding | Existing attribution: TM & © 2026 Inclusive Imagination LLC; excluded from MIT |
| Card artwork, derived images and thumbnail | Card art by Adam M Botsford; existing copyright attribution to Inclusive Imagination LLC; excluded from MIT |
| Nunito font | The Nunito Project Authors; SIL OFL 1.1 |

The original game design and concept are credited to Inclusive Imagination. This
attribution does not assert copyright over abstract ideas or methods of play.
Protected third-party content embedded in code, including card-rule strings and
adapted How to Play text, is also excluded from MIT; the program logic stays MIT.
Before redistributing a complete game, obtain the necessary content permissions
or replace that content. The software license does not grant trademark rights or
permission to imply endorsement. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md)
for the full scope, file locations, credits, and permission-status explanation.

## October 15 action-card follow-up

- Cloud Block prompts now default to **Always ask**, including Actions involving
  computer opponents rather than you. The old default is upgraded once for saved
  settings. A later explicit **When it affects me** choice is retained, as is an
  existing **Never ask** choice. Block prompts still have no time limit.
- Fog Skip remains available during the play phase, after drawing or playing a
  combo, even above seven cards. Starting to discard commits to the discard phase;
  an Action must be played first. The turn instructions and Discard row now make
  that order explicit. The reported one-off failure before discarding was not
  reproduced; the engine's turn rules have not been changed.
- Day and Night card descriptions and first-draw helper tips now mention **Storm
  Shuffle**, alongside playing the pair and Wind Trade. Night retains its final-card
  winning discard exception.

Regression coverage: 9 focused rules/menu/narration checks and 16 actual-page Node
DOM scenarios, including Full/Lite, CPU-to-CPU Actions, settings migration, shared
switch privacy, Auto Scan, canceling a discard confirmation, and narrated legend tips.
Node DOM tests do not verify rendered pixels, real speech or physical switches.

## October 14 feedback, implemented October 15, 2026

New games use these four presets. House Rules remains available as a custom setup.

| Mode | Complexity | Cards | Required combos |
| --- | --- | --- | --- |
| Chasing Rainbows Full | Most Complex | All cards | Rainbow + Sun & Rain |
| Chasing Rainbows Lite | More Complex | All except Day and Night | Rainbow + Sun & Rain |
| Rainbow Race Full | Less Complex | Colors, Wilds, Sun and Rain | Rainbow + Sun & Rain |
| Rainbow Race Lite | Least Complex | Colors and Wilds | Rainbow |

A player wins immediately when their required combos are played, they hold no Legend,
and their hand has at most seven cards. Emptying the hand is no longer required.
Legends still cannot be discarded, except Night as the last card after the required
combos (Night, Night). Wind or Storm can remove a blocking Legend and complete a win.

Chasing Rainbows keeps its existing draw, weather and discard sequence. In both Race
modes, turn order runs to the right: receive the previous player's chosen card, draw
from the pile, play any complete combos, then give a chosen unwanted card to the next
player on the right. The first player starts without an incoming card. Give at least
one card when holding any, and keep giving if necessary to finish at seven. Completing
the winning combos ends the game immediately, without a final pass. An empty hand can
end its turn if a required combo is still missing. Race has no discard pile, stealing,
or replacement draw. If the pile runs out, skip drawing and continue playing/passing.
Cards given between two seats are named only to those seats; other humans receive their
private news at the next handoff.

Existing saves retain their stored rules, including the original empty-hand goal and
old Race draw choices. Continue announces this; start a new game for the revised rules.
The printed-card play-along idea is optional future work, not online multiplayer.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `css/style.css` | The page: caption, nameplates, the table, your rainbow and hand, and the choice bar |
| `js/cards.js` | The card catalogue: names as printed, copies, rule text and sort order |
| `js/engine.js` | **The rules.** Pure code with a seeded random generator held in the state, so a saved game resumes exactly. `getDecision` and `applyMove` are the only ways to change a game. |
| `js/ai.js` | Computer players (Easy, Normal and Hard) and the Rainbow Helper's suggestions. They see only `viewFor()`, a player's-eye view of the table. |
| `js/menus.js` | Turns a decision into the turn menu tree: legal moves only, Look, then Pause last |
| `js/words.js` | Everything the game says. Hidden cards are only ever named to their owner. |
| `js/display.js` | The table's step-by-step mirror of the game, so you see each event happen |
| `js/table.js` | Draws the table and the flying cards, and runs the spotlight |
| `js/sky.js` | The living weather sky (Canvas 2D): moods, rain, storms, fog, wind, rainbows, Night |
| `js/narrator.js` | Speaks one line at a time, captions every line, and keeps a short history |
| `js/audio.js` | Sound effects and the rain loop, played through the hub's SafeAudio |
| `js/fx.js` | The big moments: callouts, confetti, reactions, the "Your turn" sweep, the spotlight ring and the table bump |
| `fonts/` | Nunito (SIL OFL 1.1), the rounded face the cards are printed in |
| `js/app.js` | Screens, switch input, the game loop and sharing the switch |
| `tools/make-card-art.py` | Makes the web card art and the hub thumbnail from `REFERENCE DATA` |
| `tools/make-sounds.py` | Synthesises every sound |

## Tests

These all run in Node only. Never use a browser to test on the development PC.

```
node tests/rules.test.cjs     # base rules and rulings
node tests/october14.test.cjs # new modes, wins, passing, privacy and save compatibility
node tests/actions.test.cjs   # Action availability, blocking eligibility and legend explanations
node tests/menus.test.cjs     # menus offer exactly the legal moves; speech never leaks hidden cards
node tests/display.test.cjs   # the table's mirror matches the engine after every move
node tests/sky.test.cjs       # the weather sky: timing, caps, photosensitivity limits
node tests/sim.test.cjs       # thousands of computer games: all finish; skill ladder; length table
JSDOM=<path to jsdom> node tests/october14-dom.cjs # actual switch menus, passes and saves
JSDOM=<path to jsdom> node tests/actions-dom.cjs   # actual Action prompts, preferences and spoken legend tips
JSDOM=<path to jsdom> node tests/dom-smoke.cjs   # whole games played by switch presses, headless
```

`dom-smoke.cjs` loads the real page in jsdom. jsdom is a Node DOM with no browser, no
rendering and no GPU. The test uses the hub's real scanner, voice manager and input guard.
It plays seven setups to the results screen:

- one player against one computer, and one against three;
- two people with one computer, sharing the switch;
- three people with open hands;
- Rainbow Race;
- House Rules with block chains, under Auto Scan;
- a tour of every screen, including pause, main menu and Continue Game.

jsdom isn't a hub dependency, so install it somewhere else (`npm i jsdom@24`) and point
`JSDOM` at it.

Not tested here: how anything looks, real speech, and real switches. Those need a person
at the real setup.

## Verification of the October 14 rules

The Node suites cover all four presets, every player count from two to six, and all three
computer skills: 18,000 seeded games, plus 600 Hard-versus-Easy games. All finish within
the move cap; Hard wins 70% of the head-to-head games. Tests also check card conservation,
instant wins with spare cards, both Legends, Wind/Storm wins, the seven-card limit,
pass direction, empty piles, private narration, legal switch menus and save/resume.

Rainbow Race Lite can still end very quickly with seven starting cards and Wilds; the
deal size and card counts were not changed by this feedback.

The focused Node DOM test loads the real page and shared scanner, including the four
mode labels, wins with spare cards, pass-row Back, confirmation, forced passes,
save/resume, private handoffs, Auto Scan and old-save compatibility. jsdom does not
render pixels or test real speech or physical switches; those remain device checks.
