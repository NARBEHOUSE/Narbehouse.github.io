# Chasing Rainbows: Switch Access Edition

This is Inclusive Imagination's weather card game, played with one or two switches. It uses
the real rules, the real card art and real opponents. Everything is spoken and nothing is
timed. One to six people can share the switch, with or without computer players.

The design and every rules decision are in [SPEC.md](SPEC.md). How the game is adapted for
switch players is in [README-ACCESSIBLE.md](README-ACCESSIBLE.md). Who owns what is in
[NOTICE.md](NOTICE.md).

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
node tests/rules.test.cjs     # every rule and ruling (24 tests)
node tests/menus.test.cjs     # menus offer exactly the legal moves; speech never leaks hidden cards
node tests/display.test.cjs   # the table's mirror matches the engine after every move
node tests/sky.test.cjs       # the weather sky: timing, caps, photosensitivity limits
node tests/sim.test.cjs       # thousands of computer games: all finish; skill ladder; length table
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

## What the simulation says

These are computer-only games, 300 per row. A round is one turn for each player.

| Mode | Players | Median rounds | Won in round 1 | Won by "Night, Night" |
| --- | --- | --- | --- | --- |
| Chasing Rainbows | 2 | 7.5–9 | 0% | 14–17% |
| Chasing Rainbows | 4 | 6.5–8 | 0% | 13–14% |
| Chasing Rainbows | 6 | 6.3–7.5 | 0% | 10–14% |
| Rainbow Race | 2 | 1 | about 64% | n/a |
| Rainbow Race | 6 | 0.5 | about 87% | n/a |

Hard beats Easy in about 71% of two-player games.

**For Inclusive Imagination:** played exactly as printed, Rainbow Race is usually decided by
the deal. A hand of seven from a deck of only Colors and Wilds very often already holds a
rainbow. We have not changed their rules. House Rules lets players add Sun & Rain or weather
cards, which lengthens the game.
