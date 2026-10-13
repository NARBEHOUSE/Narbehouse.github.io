# Chasing Rainbows: Switch Access Edition

**Game spec. Approved 2026-10-12, with changes, and built the same day.** The site owner
has now authorized a direct-link web release for creator testing. It remains absent from
the website Hub game manifest. This supersedes the earlier desktop-only publication plan
for this review release; the partner retains its art and rules rights. See "What changed
after approval" below. Files, tests and simulation numbers are in README.md; the
switch-access design is in README-ACCESSIBLE.md.

| | |
| --- | --- |
| Date | 2026-10-12 |
| Folder | `bennyshub/apps/games/CHASINGRAINBOWS/` |
| Partners | **Inclusive Imagination LLC**: the game, rules and card art. **NARBE House**: this switch-access digital edition. |
| Source material | `REFERENCE DATA/`: rules PDF v4, 18 card images, two placeholder Word documents |
| Standard it must meet | `ACCESSIBILITY.md` at the hub root (and `bennyshub/ACCESSIBILITY.md` on the website copy) |

## The idea

Chasing Rainbows ICG is a tabletop card game that was built for everyone from
the start. It has colored braille, tactile art and large print. This edition
brings it to players who cannot hold, sort or flip cards. They play it with one
or two switches.

The partner's own rules folder has a document called "Switch Access Version(s)"
that just says "Coming Soon!". This is that version.

Nothing about the game itself changes. It keeps the real rules, the real
weather tricks, real opponents and real strategy. Only how you reach your
choices is adapted:

- Every turn is a short spoken menu that offers only legal moves.
- The game tells you, out loud and on screen, what you hold, what you still
  need, and what everyone else just did.
- Nothing is ever timed, including blocking an opponent's weather card.

## What changed after approval (2026-10-12)

- **Title:** "Chasing Rainbows" (D1).
- **Sharing the switch is in this build.** Several people at one screen take turns on the
  same Space and Enter. This was in M5. Before each person's turn, a pass-the-switch card
  hides their hand, and private news waits for its owner. Racer-style one-switch-per-player
  control was not used, at the user's direction.
- **The weather is real.** A Canvas 2D sky (`js/sky.js`) sits behind the DOM table with
  moods and effects: rain, storms with soft in-cloud lightning, rolling fog, wind with
  leaves, cloud puffs, double rainbows, a rainbow arc, sunshower, day-to-night and Night,
  Night. It keeps to the no-flashing limits in §8.4.
- **Layout (user feedback):** the turn choices sit in a bar **under your hand**, not in a
  side column. The middle of the screen is only cards: a glass card table with a rainbow
  rim holds the draw pile, a **spotlight** where each weather card shows big, the discard
  pile, and every played combo laid out as real cards.
- **Simulation finding for Inclusive Imagination:** played exactly as printed, Rainbow Race
  is usually decided by the deal. 63-88% of games end in the first round, because a hand
  from a deck of only Colors and Wilds often already holds a rainbow. Chasing Rainbows
  games run about 7-9 rounds, with 10-17% won by "Night, Night". The rules are unchanged.
- **Mainstream polish (user request), with no rule changes.** Reference points:
  - **Balatro's "juice stack":** several feedback channels fire together on every big
    moment. That gives spring-overshoot motion, rising notes as a Rainbow's cards land, and
    a small table bump for Storms.
  - **Marvel Snap and Pokémon TCG:** foil on special cards.
  - **UNO mobile:** big callouts, emoji reactions and a "Your turn" sweep.

  Also added:
  - a fanned card showcase on the title screen;
  - a NEW tag on cards just picked up;
  - a progress count on the Rainbow Tracker;
  - a draw pile that glows when it's time to draw;
  - "thinking" dots on computer players;
  - a table tint that follows the weather;
  - the bundled Nunito font, matching the card faces.

  All of it respects Animations (Full, Calm or Off), and none of it flashes.
- **Rulings R1-R12** are implemented as proposed. R2 (blocking a Block) and R3 (stacking
  Fogs) are rule flags, and Block a Block is a House Rules switch.

---

## 1. Decisions needed before we build

### For NARBE House

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Title in the hub | **"Chasing Rainbows"**, with "by Inclusive Imagination" on the title screen. Use "Chasing Rainbows ICG" if the partner prefers it. |
| D2 | First release | Milestones M1 to M4 (§14): you against 1 to 5 computer players, full rules, Rainbow Race and House Rules. Pass-and-play for several people, Screen Reader Mode and a solo no-fail mode come later, in M5. |
| D3 | Hub genre | `["Card", "Strategy"]`. "Card" is a new genre, so the genre filter gains a new chip. Using only existing genres: `["Strategy", "Classic"]`. |
| D4 | Rainbow Helper default | **On (Tips).** A star marks the suggested choice. It never plays for you, and you can turn it off. |
| D5 | Confirm before discarding | **Off**, available as a setting. Turning it on adds a "Discard Red? / Choose again" step to every discard. |
| D6 | Who goes first | The switch player, by default. Settings also offer Random and Take Turns. |

### For Inclusive Imagination (rules and rights)

The printed rules leave a few situations open, and a computer has to do
*something* in each one. These are our proposed rulings. Any of them can change
with a one-line edit before build.

| # | Open question | Proposed ruling |
| --- | --- | --- |
| R1 | The draw pile runs out | Shuffle the discard pile, except its top card, into a new draw pile. If both piles are empty, skip the draw. |
| R2 | Can a Cloud Block itself be blocked by another Cloud? | **No.** It's easier to follow by ear. A "Block a Block" House Rule can be added if they want it. |
| R3 | Two Fog Skips on the same player | They **stack**: each Fog costs one turn. |
| R4 | When the win is checked | The instant a player's hand reaches zero after they have played a Rainbow and a Sun & Rain. This can happen on someone else's turn, since a Storm can empty your hand. |
| R5 | Wind Trade: can the random card you take be the one you just gave? | **No.** The random card comes from their hand as it was *before* your gift arrives. |
| R6 | Wind Trade when someone has no cards | That player can't be chosen. You also need at least one other card to give. |
| R7 | Is the draw at the start of a turn optional? | **Required.** You must draw or take one card. |
| R8 | Rainbow Race details | Win by playing a Rainbow and emptying your hand. "Take a card from a player" takes a random card, and that player draws a replacement straight away. |
| R9 | "The youngest player begins" | The switch player begins (see D6). |
| R10 | Using Cloud Block | Cloud Block is only played in response to someone else's weather card, at any time. It can't be your one weather card on your own turn, but it can be discarded like any card. |
| R11 | What Storm Shuffle can name | Only card names in this game's deck. For example, Day and Night can't be named in Rainbow Race. Storm takes cards from every hand and the discard pile, never from combos already played. |
| R12 | "Night, Night!" | When a player wins by discarding Night, the game says "Night, Night!" aloud and shows a short moon scene. |
| P1 | **Permission and licence for the art and rules** | We need written OK to publish the 18 card images and the rules text in the hub desktop app, on the narbehouse.github.io website and in the public GitHub repository. Hub code is MIT-licensed. The art, rules text and the Chasing Rainbows name stay © and ™ Inclusive Imagination LLC, and are **excluded from the MIT licence** by a `NOTICE.md` in the game folder. The hub already does this kind of thing: Benny's Bowling carries its own GPLv3 licence. |
| P2 | Assets we'd like | The rainbow logo from the rules cover, for the title screen and hub thumbnail. Their preferred credits wording. Their Video Walkthrough link when it exists; the hub's How to Play window can embed it. |
| P3 | Linking | May we call this the "Switch Access Version", and may their site link to it? |

---

## 2. What is in the folder today

- **`Chasing-Rainbows-ICG-Text-Only-Directions-v4.pdf`**: the complete rules, 7
  pages. This is the source of truth for §3.
- **`Standard Chasing Rainbows Directions (HTML).docx`**: only a title, linking
  to inclusiveimagination.co/chasing-rainbows-icg/. That page repeats the PDF
  and leaves the same gaps open.
- **`Switch Access Version(s).docx`**: "Coming Soon!"
- **18 card images**: PNG, 1016 × 1547 portrait, one per card type plus the
  card back.
  - Every face has the card class at the top and the card name at the bottom,
    in print and braille. A friendly face sits in the middle. Each card carries
    "Artist: Adam M Botsford" and "TM & © 2026 Inclusive Imagination LLC".
  - Colors: a solid color with a smiley face. Wild has rainbow stripes.
  - Core: Sun on yellow stripes, Rain on blue stripes.
  - Legend: Day is white on white. Night is the same design inverted, white on
    black.
  - Weather cards are grey with white panels: Cloud Block, Double Draw, Fog
    Skip, Storm Shuffle, Wind Trade.
- **Missing**: logo or title art, sounds, video.

The art already does much of the accessibility work. It is high contrast, it
puts the name in large print, and it never relies on color alone, since every
card is named in words. We use the real card faces as they are.

---

## 3. The rules, as the game will run them

### 3.1 Deck

| Card | Class | Copies per set |
| --- | --- | --- |
| Red, Orange, Yellow, Green, Blue, Indigo, Violet | Color | 3 each |
| Wild | Color | 4 |
| Sun, Rain | Core | 3 each |
| Day, Night | Legend | 1 each |
| Cloud Block, Double Draw, Fog Skip, Storm Shuffle, Wind Trade | Weather (action) | 3 each |
| **Total** | | **48** |

- 2 players use 1 set (48 cards).
- 3 to 4 players use 2 sets (96).
- 5 to 6 players use 3 sets (144).
- Rainbow Race uses only Colors and Wilds: 25 cards per set.

### 3.2 Setup

Shuffle the deck and deal 7 cards to each player. Turn the top card of the draw
pile face up to start the discard pile. The first player is chosen as in D6.

### 3.3 A turn

1. **Draw.** Draw the top card of the draw pile, *or* take the top card of the
   discard pile. You can't take from the discard pile when a weather card is on
   top: weather cards freeze it.
2. **Play** (optional, in any order). Play any combo you have complete and have
   not played yet. You may also play **one** weather card.
3. **Discard.** If you hold more than 7 cards, discard down to 7. Otherwise you
   may discard one card, or end your turn without discarding.

### 3.4 Combos

Each combo can be played once per player per game. Only complete combos can be
played.

- **Rainbow**: seven cards, one for each of Red, Orange, Yellow, Green, Blue,
  Indigo and Violet. A Wild stands in for any missing color, with no limit on
  how many Wilds you use. The game builds the rainbow for you: real colors
  first, Wilds only for the gaps. No sub-menu is needed, because after a
  Rainbow is played the leftover color cards are equally useless whichever
  ones you keep.
- **Sun & Rain** (the Core combo): one Sun and one Rain.
- **Day & Night** (the Legend combo): one Day and one Night. It's optional for
  winning, but it's the only way to play Day.

### 3.5 Legends

Day and Night can never be discarded. They can only be traded away with Wind,
shuffled back by Storm, or played as Day & Night.

**"Night, Night" exception:** if Night is your last card and you have already
played your Rainbow and Sun & Rain, you may discard it to win.

The game explains this the first time a Legend shows up. The Helper (§6.4)
watches for the trap of holding Day without Night.

### 3.6 Weather cards

Any weather card on top of the discard pile freezes it.

| Card | What it does | What you choose |
| --- | --- | --- |
| **Cloud Block** | Cancels a weather card someone else just played. Both cards go to the discard pile, with Cloud on top. The player's weather card is still used up. | Block or let it happen (§5.4). |
| **Double Draw** | Draw 2 cards from the draw pile. | Nothing. |
| **Fog Skip** | The chosen opponent misses their next turn. Skips stack (R3). | Which opponent. Skipped when there is only one. |
| **Storm Shuffle** | Every copy of the named combo card, in every hand including yours and in the discard pile, is shuffled back into the draw pile. Played combos are safe. | Which card name (R11). |
| **Wind Trade** | Give one of your cards to an opponent and take a random card from their hand (R5). Legends may be given. | Which opponent, then which card to give. |

### 3.7 Winning

You win when your hand is empty and you have played a **Rainbow** and **Sun &
Rain**. Playing Day & Night is a bonus; the results screen celebrates it.

Hand-size arithmetic makes the ending a puzzle. Each turn you draw one card and
discard at most one, so your hand only shrinks by playing combos and weather
cards. In practice you play Sun & Rain first, then finish on a turn where your
whole hand, plus at most one discard, is a Rainbow. The Helper explains this
when you reach that stage, because it is the least obvious part of the game.

### 3.8 Game modes and House Rules

| Mode | Deck | Draw step | Win |
| --- | --- | --- | --- |
| **Chasing Rainbows** (default) | Full deck | Draw pile or discard pile | Rainbow + Sun & Rain + empty hand |
| **Rainbow Race** (official simpler variant) | Colors and Wilds only | Draw pile, or take a random card from a player, who then draws a replacement | Rainbow + empty hand |
| **House Rules** | You choose | You choose | Follows what's turned on |

**House Rules** is this game's "editor" (ACCESSIBILITY.md §1). Every option is
a setting you cycle with the switch, so no mouse is needed and no warning
dialog is required:

- Weather cards: All, None, or each of the five turned on or off.
- Sun & Rain: On or Off. When off, it isn't needed to win.
- Day & Night: On or Off.
- Draw choices: Discard pile (standard) or Take from a player (Rainbow Race).

This follows the rulebook's own advice to "add in Core Combo and/or Actions
when ready". A caregiver or teacher can grow the game with the player.

---

## 4. What makes this edition inclusive

1. **Only legal moves are offered.** You cannot make an illegal play, so you
   don't have to memorize rules to play correctly. A frozen discard pile simply
   doesn't appear as a choice, and the game says why.
2. **Everything is spoken and captioned.** Every focus, choice and outcome is
   spoken, including every computer move. A caption strip shows the same words
   in large print, for players who are deaf or hard of hearing, or who missed a
   line.
3. **You can always ask "what do I have?"** The Look group (§5.5) reads your
   hand, your rainbow progress, the other players and the piles, on demand and
   as often as you like.
4. **The Rainbow Tracker** (§8.2) shows progress with letters, check marks and
   patterns, never color alone. It also says it aloud: "5 of 7 colors plus 1
   Wild. Still need 1 of green, indigo, violet."
5. **Nothing is timed.** Cloud Block prompts wait for you. Computer turns are
   paced to your speech and your chosen speed.
6. **Fewer presses per turn.**
   - A step with only one legal option happens by itself, and the game says
     what happened.
   - Duplicate cards are grouped into one choice: "Red, you have 2".
   - Rainbows are built automatically.
   - The Helper can offer a one-press shortcut to its suggestion.
7. **One game for the whole range of players.** There are three computer
   skill levels, Rainbow Race, House Rules, and Open Hands for teaching. Real
   opponents stay in every mode; practice still challenges.
8. **The partner's design is kept.** The real card faces, words and art are
   used as they are. Card names are spoken exactly as printed ("Fog Skip", not
   "Skip card").
9. **Pick up where you left off.** The game saves after every step. A tired
   player can stop mid-game and continue later.

---

## 5. Controls and scanning

Every state in this game is a **CHOICE** state (ACCESSIBILITY.md §4): if the
player stops pressing, nothing keeps happening. The full hub choice contract
therefore applies everywhere:

- Space moves to the next choice and Enter selects it. Holding Space scans
  backward.
- Auto Scan (one switch) advances the highlight by itself, and Enter selects.
- Every menu opens with **nothing highlighted**. The first press highlights
  item 1, and Enter does nothing until then.
- Each root list has a silent blank stop, written below as `-1`. Parking, Space
  brake and Wait for Speech all behave as in §4 of ACCESSIBILITY.md.
- Lists you step into (a "row", marked ▸) loop forever in both directions
  through a spoken **Back** stop. Back returns to the same item.
- Menu actions happen on switch release, through the shared controller, with
  no added debounce or minimum press length.
- Mouse and touch can click any choice or card directly.

### 5.1 Turn start: Draw

```
-1 → Draw from the pile → Take Orange → Look ▸ → Pause → -1
```

- "Take Orange" is left out when the discard pile is frozen or empty. The game
  says "Discard pile frozen by Fog Skip."
- **Auto-draw**, on by default: when drawing from the pile is the only option,
  the game draws for you and says "Discard pile frozen. You drew Blue." This
  saves two presses on many turns.
- In Rainbow Race: `Draw from the pile → Take from Misty` (one item per
  opponent with cards, or a `Take from a player ▸` row when there are 3 or more
  opponents) `→ Look ▸ → Pause`.

### 5.2 Your turn: Play and Discard (one menu)

```
-1 → Play your Rainbow → Play Sun & Rain → Play Day & Night
   → Double Draw → Fog Skip → Storm Shuffle → Wind Trade
   → Discard a card ▸ → End turn → Look ▸ → Pause → -1
```

- Only what is legal right now appears. Combos appear only when complete.
  There is one weather item per type you hold, and they all disappear once you
  have played a weather card this turn. Cloud Block never appears here (R10).
- When a combo completes, it is announced ("Your rainbow is ready!") and is
  the first choice.
- **Discard a card ▸** opens your hand as a row. Duplicates are grouped, cards
  are sorted in rainbow order, and Legends that can't be discarded are left out
  (a one-time spoken hint explains why). When Night, Night applies, the row
  includes **"Night: say Night, Night and win!"**
- **End turn** (keep your cards) is offered only with 7 or fewer cards.
- **Over 7 cards:** End turn is removed and the item becomes "Discard down to 7
  ▸". If nothing else is playable, the game opens the hand row directly. You
  stay in the row until you are down to 7, and it says "Discard 2 more."
- Discarding ends the turn. So does reaching 7 through forced discards.

### 5.3 Choosing targets

Targets open as a nested row with a Back stop. Choosing **Back** cancels and
returns you to the turn menu with the weather card still in your hand.

- **Fog Skip:** a row of opponents: "Misty, 5 cards". Skipped when there is
  only one opponent.
- **Storm Shuffle:** two stages, `Colors ▸ / Sun & Rain ▸ / Day & Night ▸`,
  then the card names. Only names in this deck are listed.
- **Wind Trade:** pick the opponent (skipped when there is one, and only
  players with cards are listed), then the card to give from your grouped hand
  row.

### 5.4 Cloud Block prompts (interrupts)

When someone plays a weather card, each other player who holds a Cloud Block is
asked in turn order, starting after the player who played it. The first
"Block" cancels the card.

For the switch player, a prompt opens as a fresh menu at `-1`, and speaks
before any choice is highlighted:

> "Misty plays Fog Skip on you. You have a Cloud Block."

```
-1 → Block it with Cloud → Let it happen → Look ▸ → Pause → -1
```

- **No timeout, ever.** The game waits for the player.
- Setting **Block prompts**:
  - *Ask when it affects me* (default): Fog Skip or Wind Trade aimed at you, or
    a Storm Shuffle naming a card you hold.
  - *Always ask*.
  - *Never ask*: never block, so no interruptions.

  The default keeps interruptions to the moments that matter.

### 5.5 Look ▸

Look is read-only. Each item speaks when selected, not when highlighted, so
scanning past it stays quiet.

| Item | Says |
| --- | --- |
| My hand | "7 cards: Red, Red, Orange, Blue, Wild, Sun, Fog Skip." |
| My rainbow | "5 of 7 colors plus 1 Wild. Still need 1 of green, indigo, violet. Sun yes, Rain no." |
| Players | "Misty: 5 cards, played a Rainbow. Breezy: 7 cards, skips next turn." |
| Piles | "Discard pile: Orange on top, frozen: no. Draw pile: 23 cards." |
| What just happened | Replays the last 6 narrated events. |

### 5.6 While other players take their turn

The scan holds only `-1 → Look ▸ → Pause`. Pausing waits for the current
computer move to finish, then opens the Pause menu. Your own scan speech
interrupts narration (the hub rule), and "What just happened" replays anything
you talked over.

### 5.7 Pause routes

**Pause is a scan item in every in-game menu, always last.** It sits after the
choices you came for, so it never stands between you and your move. No hold is
required anywhere in this game.

Holding Enter for 5 seconds also opens Pause, as an extra route. A ring
appears after 2 seconds. This matches Benny's Sphere Splash and NARBE Mini
Golf.

### 5.8 Estimated presses per turn (two switches)

| Turn | Presses |
| --- | --- |
| Draw from pile, keep all, end turn | about 2 + 3 = **5** |
| Take the discard, discard a card from a 7-card hand | about 3 + 2 + 4 = **9** |
| Same turn with Helper Shortcut on | about 2 + 2 = **4** |
| Discard frozen (auto-draw), discard a card | about 2 + 4 = **6** |

These are budgets, not promises. The simulation in §12 records real
distributions.

---

## 6. Speech, captions and sound

### 6.1 Speech rules

- Use the shared `NarbeVoiceManager` for voice and TTS on/off. The game never
  keeps its own copy of those settings.
- Labels are short, because they're spoken at every scan step. Use "Take
  Orange", not "Take the Orange card from the top of the discard pile".
- Each card type's rule is explained the first time it's highlighted in a
  game. After that, only the short label is spoken (the Benny's Baseball
  pattern).
- **Narration queue:** computer moves and outcomes queue behind the line being
  spoken. They are never cut off by a scene change.
  - The results screen holds until speech ends, plus about 0.6 s, capped at
    about 9 s.
  - Scan and selection speech interrupt the queue and clear it.
  - Duplicate lines are dropped.
- Hidden information is never spoken. Computer players' cards are never named,
  unless Open Hands is on. In a later pass-and-play mode, a hand is spoken only
  to its owner.

### 6.2 Sample lines

| Moment | Line |
| --- | --- |
| Your turn | "Your turn. Orange is on the discard pile." |
| Draw | "You drew Blue." |
| Combo ready | "Your rainbow is ready!" |
| Computer move | "Misty takes Orange from the discard pile." / "Misty plays Fog Skip on you. You miss your next turn." |
| Storm | "Breezy calls a Storm on Red. All the Reds go back into the deck. You lose 2." |
| Endgame hint (Helper) | "You've played Sun and Rain. Now your whole hand needs to become a rainbow." |
| Win | "You caught the rainbow! You win!" / "Night, Night! … You win!" |
| Lose | "Misty caught the rainbow. Misty wins." |

### 6.3 Captions

A caption strip at the top of the screen shows the current line in large text.
It's on by default, set by the **Captions** setting.

### 6.4 Rainbow Helper

The Helper uses the same evaluator as the Normal computer player. It never
looks at hidden cards.

- **Off.**
- **Tips** (default, D4): marks the suggested choice with a ★. The word
  "suggested" is spoken after its label. It also gives the one-time hints: the
  Legend trap, the endgame arithmetic, the frozen pile.
- **Tips + Shortcut:** also adds a first choice, "★ Suggested: Discard Red". A
  confident player can then take a whole turn in about 4 presses.

### 6.5 Sound

Sound plays through `SafeAudio`, never through the Web Audio API.

- Cues that play every turn (a card flick when drawing or discarding) must be
  shorter than 0.4 s, below 2.5 kHz, soft-attack and quiet.
- Use the built-in `select`, `score` (combo played), `win` and `lose`, with no
  URL for built-ins.
- Add one generated `sound/card.wav` for the card flick.
- Loud, bright sounds are for wins only.

---

## 7. Screens

**Title.** Chasing Rainbows logo (P2), "by Inclusive Imagination". Scan:

```
-1 → Continue Game (only when a save exists) → New Game → How to Play
   → Settings → Credits → Exit Game → -1
```

**New Game setup.** Values cycle in place and keep the highlight. The last
setup is remembered, so Start is first and one press starts a game.

```
-1 → Start → Mode: Chasing Rainbows / Rainbow Race / House Rules
   → Opponents: 1–5 → Computer skill: Easy / Normal / Hard
   → Who goes first: You / Random / Take turns → Open hands: Off / On
   → House Rules ▸ (only in House Rules mode) → Back → -1
```

Open hands shows every hand face up and lets Look read them aloud. It's meant
for teaching, or for playing alongside a helper.

**How to Play.** Spoken pages, scanned with `Next / Previous / Back`:

- Goal
- Your turn
- Combos
- Legends and Night, Night
- Each weather card
- Game modes

A **Card Gallery** pages through every card face, speaking its name and rule.
This mirrors the partner's "Image Description Archive". When the partner's
video exists, it plays through the shared `tutorial-modal.js`.

**Settings.** The canonical hub order (ACCESSIBILITY.md §7):

| Item | Values |
| --- | --- |
| Text to Speech | On / Off |
| Voice | cycles available voices |
| Rainbow Helper | Off / Tips / Tips + Shortcut |
| Block prompts | Ask when it affects me / Always ask / Never ask |
| Turn pace | Slow / Normal / Quick (computer moves) |
| Auto-draw | On / Off |
| Confirm discards | Off / On |
| Captions | On / Off |
| Animations | Full / Calm / Off (defaults to Calm if the device asks for reduced motion) |
| **Auto Scan** | On — One Switch / Off — Two Switches |
| **Scan Speed** | 1 s / 2 s / 3 s / 4 s / 5 s |
| Sound Effects | On / Off |
| Reset Progress | two-step confirm (clears stats, not the saved game) |
| Back | |

Text to Speech, Voice, Auto Scan and Scan Speed are always kept. Players who
open the game outside the hub, from switchedgames, have no other way to reach
them.

**Pause.**

```
-1 → Continue → Help → How to Play → Settings → Restart
   → Main Menu → Exit Game → -1
```

- **Help** speaks "I need help" and keeps the menu open.
- **Restart** asks for confirmation, with Cancel first. It's the only pause
  item that throws away a game.
- **Main Menu** and **Exit Game** keep the autosave, so nothing is lost.
- Exit sends `{action:'focusBackButton'}` to the hub, or opens
  `../../../index.html` when running outside it.

**Results.** Shown after the win line finishes speaking:

- Who won and how ("Night, Night!" and Day & Night are celebrated).
- Turns taken, and your record against this skill level.

```
-1 → Play Again → Change Setup → Main Menu → Exit Game → -1
```

**Credits.**

- "Chasing Rainbows ICG is a game by Inclusive Imagination."
- "Card art by Adam M Botsford."
- "Switch access edition by NARBE House."
- The partner's preferred wording (P2) replaces these lines when we have it.

---

## 8. Look and feel

### 8.1 Table layout

The layout is landscape-first and must also work on tablet, narrow and short
windows.

*As built (user feedback, 2026-10-12): from top to bottom, the caption, the other players'
nameplates, the card table, your Rainbow Tracker beside your hand, and the choice bar under
your hand. The table holds the draw pile, the spotlight, the discard pile, and every
player's played combos as real cards. The original plan follows.*

- **Top: opponents.** One seat card per opponent. Each shows:
  - a weather avatar and name
  - card count, as a number and a fan of card backs
  - played combos, as small badges
  - "Skips next turn", as fog over the seat plus the words
  - a ring around whoever's turn it is
- **Middle: piles.** The draw pile (card back and count) and the discard pile
  (top card face up). A frozen discard pile shows a "Frozen" tag in words, not
  just the weather card.
- **Bottom: your hand.** Real card faces, grouped, sorted in rainbow order
  (Colors ROYGBIV, Wild, Sun, Rain, Day, Night, weather), each with a ×2 or ×3
  badge.
- **Above the hand: the Rainbow Tracker** and your played combos.
- **Choice bar:** the current menu as large buttons with an icon and text,
  each at least 64 px tall. A choice that refers to a card also highlights
  that card on the table. "Take Orange" lights up the discard pile, and the
  hand row highlights the real cards.

### 8.2 Rainbow Tracker

- Seven arc bands labeled **R O Y G B I V**. A held color is solid with a check
  mark. A missing color is hollow and dashed. A gap covered by a Wild is
  striped and carries a Wild star.
- Then Sun, Rain, Day and Night slots in the same style.
- When a combo is played, its section becomes a finished arc labeled
  "Played".
- Nothing is shown by color alone: every slot has a letter or icon and a
  filled, hollow or striped state.

### 8.3 Highlight

The hub highlight style is a thick outline plus a lift, using the hub
highlight color and style settings wherever the shared modules expose them. A
dotted outline marks a paused scan (Space brake). The Back stop shows a dashed
outline around the row.

### 8.4 Animations

| Event | Animation |
| --- | --- |
| Deal, draw, discard | Card slides |
| Rainbow played | Cards fly up and form an arc |
| Double Draw | Two small rainbows |
| Fog Skip | Fog rolls over the target's seat |
| Storm Shuffle | Cards spiral from hands into the deck |
| Wind Trade | Two cards swap along a breeze |
| Cloud Block | A cloud puffs over the blocked card |
| Night, Night | Moon and stars |

- **Calm** keeps only short crossfades. **Off** is instant.
- **No flashing.** Storm lightning is a soft, low-contrast glow, never a white
  flash, and never more than one per second (WCAG 2.3.1).
- Animations never need input, never extend a timed window (there are none),
  and never hide the choice bar.

### 8.5 Art pipeline

The 18 PNGs in `REFERENCE DATA/Game Art/` stay untouched as the masters. A
script makes web copies 480 px wide, WebP, in `img/cards/`. That shrinks the
1.1 MB card back to roughly a tenth of its size. `REFERENCE DATA/` is not
published to the website unless the partner says so.

---

## 9. Computer players

- Computer players see only what a real player at the table could see: their
  own hand, the top of the discard pile, pile sizes, hand counts, played combos
  and what has been taken from the discard pile. They are given a `viewFor()`
  object, never the full game state, and a test enforces this.
- Names come from the weather: Sunny, Misty, Breezy, Drizzle, Thunder.

The skill names match Benny's Sphere Splash, the only other hub game with a
computer-skill setting.

| Skill | Behaviour |
| --- | --- |
| **Easy** | Draws sensibly but plays loosely. Rarely plays weather on you. Blocks about a third of the time. Good for learning. |
| **Normal** | Takes the discard when it fills a need. Plays combos at once. Uses Double Draw when short. Fogs and Winds whoever is closest to winning. Trades away dead cards (Day with no Night first). Blocks actions aimed at itself. |
| **Hard** | Normal, plus: remembers public information (who took what), manages hand size for the finish, saves Cloud Block for critical moments, and avoids discarding what the next player just took. |

Pacing: each computer step waits for its narration to end, then for the Turn
pace gap: Slow 1.5 s, Normal 0.8 s, Quick 0.3 s. With TTS off, fixed delays
apply: 2.5 s, 1.5 s and 0.7 s.

---

## 10. Saving

All three keys live in `localStorage`. Access settings (TTS, voice, Auto Scan,
scan speed) live only in the shared managers and are never copied here.

| Key | Holds |
| --- | --- |
| `chasingrainbows_settings` | Game settings from §7 and the last New Game setup, including House Rules |
| `chasingrainbows_save` | The game in progress (engine state plus random seed), written after every completed step |
| `chasingrainbows_stats` | Games played and won per skill level, rainbows played, Night, Night wins, fewest-turn win |

The key names follow the existing games' style, such as `bennysdice_settings`.

---

## 11. How it's built

**Plain HTML, CSS and JavaScript: a DOM card table over a Canvas 2D weather sky.**
There is no WebGL and no framework. Cards are images, and the DOM gives crisp scaling, CSS
animation and ARIA for a later Screen Reader Mode. The sky (`js/sky.js`) is one 2D canvas:
its pixel ratio is capped, it pre-renders, it runs at 30 fps when idle, and it stops
when the page is hidden. It isn't WebGL, so `NarbeGraphics` isn't needed; the Animations
setting controls it.

```
CHASINGRAINBOWS/
  index.html
  css/style.css
  js/cards.js      card catalogue: ids, names, spoken names, rule text, art path, sort order
  js/engine.js     rules engine, pure: no DOM; UMD so it runs in the browser and in Node
  js/ai.js         computer players, pure: gets viewFor() only
  js/menus.js      decision + view + settings → choice list with stable ids, pure
  js/narrator.js   events → sentences, speech queue, captions, history
  js/table.js      DOM rendering and animations
  js/app.js        screens, scan bridge, settings, saving, hub exit
  img/cards/*.webp
  sound/card.wav
  tests/*.test.cjs Node-only
  tools/make-card-art.py
  README.md  README-ACCESSIBLE.md  NOTICE.md
  REFERENCE DATA/  (masters, unchanged)
```

**Engine API.** The UI, narrator and AI all consume the same event stream.

```js
createGame(config, seed)            // → state  (seeded RNG stored in state, so saves resume exactly)
getDecision(state)                  // → { playerId, kind, options } or { kind:'over', winnerId, how }
                                    //   kind: draw | turn | discard | pick-player | pick-card-name
                                    //         | give-card | block
applyChoice(state, playerId, id)    // → { state, events }   (rejects anything not in options)
viewFor(state, playerId)            // → what that seat may know
```

- **Stable choice ids**, such as `draw.pile`, `take.discard`, `combo.rainbow`,
  `weather.fog`, `discard.red`, `turn.end`, `look`, `pause`. Redraws keep the
  highlight on the same id (ACCESSIBILITY.md §4, "Navigation and identity").
- **Scan bridge:** `NarbeScanManager.createChoiceScan` through
  `NarbeChoiceScanAdapter`, with a status host outside the choice bar. Rows use
  `enterGroup(items, {wrap:true, backStop:true})`. `choice-scan.js` is never
  edited: it is byte-synced into the Companion build.
- **Required hub plumbing:**
  - script load order per ACCESSIBILITY.md §5
  - a `narbe-input-cancelled` handler that clears half-held input
  - the hub exit message
  - the Pause menu Help item
  - Settings rows that wrap the shared managers

**What to reuse, and from where.** No hub game has a card, deck or deal
renderer yet. The card table, card faces, Rainbow Tracker and animations are
new work. Everything else has a model to copy:

| Need | Copy from |
| --- | --- |
| `<script>` block in `<head>` | `NARBEMINIGOLF/index.html:99-109`: safe-audio, electron-bridge, platform, scan-status-badge (+ .css), choice-scan, choice-scan-adapter, voice-manager, ios-audio-fix, scan-manager. Drop `graphics-quality.js`. |
| Switch key wiring | `BENNYSSPHERESPLASH/js/ui.js:337-400`: keydown ignores repeats; Space → `brakePress()` / `setInputHeld()`; a 3 s Space hold steps backward at the scan interval; keyup Space → `step(1)`, Enter → `select()`; 5 s Enter-hold pause with a ring from 2 s; `narbe-input-cancelled` and `blur` clear held keys |
| Rows with a Back stop | `adapter.enterGroup(items, {wrap:true, backStop:true})` in, `adapter.back({restore:true}); adapter.sync(...)` out, as in `BENNYSBATTLEBOATS/scan-access.js:14` and `BENNYSMATCHYMATCH/scan-access.js:7` |
| Paged How to Play | `BENNYSSPHERESPLASH/js/ui.js:622-645`: each page spoken whole on open, "How to play, page N of M" |
| Seeded shuffle | `SS.util.shuffle(list, rnd)` in `BENNYSSPHERESPLASH/js/util.js:67-71` |
| UMD rules module + Node test | `NARBEPICKLEBALL/js/model.js` with `tests/rally-model.test.cjs` (`node:test`) |
| Computer-skill setting | `BENNYSSPHERESPLASH/js/ui.js:453-457` (Easy / Normal / Hard) |
| Results screen with speech | `NARBEMINIGOLF/js/ui.js:517-545` |
| Hidden-hand handoff (M5) | Battle Boats' "look away" cover screen: `showCoverScreen` / `onCoverReady` in `BENNYSBATTLEBOATS/scripts/battleship.js:1035-1090` |

---

## 12. Testing

Tests are Node only. No browser or Electron runs are used on the development
PC. Visual and switch checks are done by a person.

| Test | Covers |
| --- | --- |
| `tests/rules.test.cjs` | Deck counts for 1, 2 and 3 sets and Rainbow Race; the deal; first discard; frozen discard; required draw. The 7-card limit and discard-down. Legends can't be discarded; the Night, Night exception. Rainbow detection with Wilds (including an all-Wild rainbow). One combo of each kind. Every weather card, including Storm on the caster and played combos being safe, Wind's pre-gift random pick, Fog stacking, and Block on/off. Win checks on discard, on combo and during another player's Storm. Empty-pile reshuffle and the both-piles-empty skip. |
| `tests/sim.test.cjs` | 10,000 seeded computer-only games per player count and skill level. Every game ends under a turn cap with zero illegal moves. Reports median and 95th-percentile turns and how games are won. Hard beats Easy at least 60% of the time. **If games run long (for example, Day stuck in a hand), we bring the numbers to the partner rather than changing their rules.** |
| `tests/view.test.cjs` | `viewFor()` never contains another seat's cards or the draw order. |
| `tests/menus.test.cjs` | Every decision builds a list with only legal choices, stable ids, Pause last, Look present, no Cloud Block on your own turn, and no undiscardable Legend in the discard row. |
| `tests/save.test.cjs` | Save to JSON, restore, and the next 50 moves are identical. |
| `node --check` | Every JS file. Also confirm file sizes are sensible, since a passing syntax check proves little on its own. |

---

## 13. Hub integration (at release, after approval)

- Add to `bennyshub/apps/games/games.json`:

  ```json
  {
    "id": "chasingrainbows",
    "title": "Chasing Rainbows",
    "description": "Inclusive Imagination's weather card game, played with one or two switches. Collect every color of the rainbow plus Sun and Rain, then empty your hand, while Fog, Wind, Storms and Clouds change everything. Everything is spoken, nothing is timed, with computer opponents, Rainbow Race and House Rules.",
    "path": "apps/games/CHASINGRAINBOWS/index.html",
    "image": "images/games/chasingrainbows.png",
    "genres": ["Card", "Strategy"]
  }
  ```

- Add the thumbnail `bennyshub/images/games/chasingrainbows.png`, from the
  partner logo (P2), or a fan of card faces made with the art script.
- In `ACCESSIBILITY.md`, on both the desktop copy and the website copy's
  `bennyshub/ACCESSIBILITY.md`:
  - a §8 row
  - a §12 pause-route row: "Pause is the last item in every turn, target and
    Block prompt menu, and stays in the scan, with Look, while others play. A
    5 s Enter hold also pauses."
  - the catalog count goes from 28 to 29
  - a §13 note that the art is partner-owned
- **Website copy (F:)**, after the user approves: copy the folder and add the
  analytics `<script>` tag and the two favicon links, as on every catalog page.
  Leave out `REFERENCE DATA/` unless P1 allows it. The user commits and builds.
- Before calling it done, a person using the real switch setup plays the whole
  chain: hub, game, every menu, a full game, pause, settings, and back to the
  hub. Do this once with two switches and once with Auto Scan.

---

## 14. Milestones

| # | Delivers | Done when |
| --- | --- | --- |
| **M1** | `cards.js`, `engine.js`, `ai.js`, all Node tests and the simulation report | All tests pass; simulation numbers shared with the partner; R1 to R12 confirmed or changed |
| **M2** | Playable: you against 1 computer player, full rules, every menu in §5, speech, captions, Pause, Settings, save and resume, hub exit | Code review against ACCESSIBILITY.md §10; user test with switches |
| **M3** | 2 to 6 players (multiple sets), the three skill levels, multi-player Block prompts, Rainbow Race, House Rules | Simulation passes at every player count; user test |
| **M4** | Art pipeline, animations and Calm mode, sounds, How to Play and Card Gallery, Credits, Results, thumbnail, games.json, ACCESSIBILITY rows, README-ACCESSIBLE.md and NOTICE.md | Full checklist; partner reviews the build |
| **M5** (later, optional) | Pass-and-play for several people, with a "pass to Maya" cover screen modeled on Battle Boats' and per-person Block prompts. Screen Reader Mode: hub TTS off, narration to an ARIA live region, cards as real buttons, so it works with VoiceOver, NVDA and refreshable braille displays. A solo no-fail "Rainbow Walk" with no opponents and no losing. | Separate approval |

## 15. Not in this version

- Online play
- Custom card art or photo packs: the partner's card identity stays intact
- Other languages
- Changes to the partner's rules beyond the rulings in §1
