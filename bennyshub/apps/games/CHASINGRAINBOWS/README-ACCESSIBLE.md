# How Chasing Rainbows is adapted for switch players

The tabletop game was already built for everyone, with braille, tactile art and large print.
This edition is for players who can't hold, sort or flip cards. They play it alone, with one
or two switches, against the computer or with family at the same screen. This document
records what changed and why. The hub's rules are in `ACCESSIBILITY.md` at the hub root.

## Every state is a choice

Nothing in this game moves on its own while you decide (ACCESSIBILITY.md §4). Every screen
uses the hub's shared choice scanner:

- **Two switches:** Space moves and Enter chooses. Holding Space for 3 seconds scans backward.
- **One switch (Auto Scan):** the highlight moves by itself, and Enter chooses. Parking, the
  Space brake and Wait for Speech all come from Hub Settings.
- Every menu opens with **nothing highlighted**. Enter does nothing until a choice is lit.
- Menu choices act when the switch is **released**. A press of any length short of the
  pause hold counts as an ordinary press.
- Mouse and touch can tap any choice, hand card or nameplate directly.

## A turn

Your choices sit in the bar under your hand, and only legal moves ever appear. You can't make
an illegal play, so you don't have to remember the rules to play correctly. For example, a
frozen discard pile isn't offered, and the game says why.

| Step | Choices |
| --- | --- |
| Draw | Draw a card · Take *Orange* (when the discard pile isn't frozen) · Look · Pause |
| Play | Any combo that's ready · each weather card you hold · Discard a card ▸ · End turn · Look · Pause |
| Over the hand limit | "Discard down to 7 ▸". End turn appears again once you're at 7. |

Choices marked ▸ open a row, and the row puts the highlight right where the action is:

- **Discard a card** and **Wind Trade → Give** highlight the real cards in your hand.
  Duplicates are grouped ("Red, you have 2"), and Day is never offered.
- **Fog Skip** and **Wind Trade** with several opponents highlight their nameplates.
- **Storm Shuffle** and **Look** open a short list in the bar.

Every row loops through a spoken **Back** stop, shown with a dashed outline. Back returns to
the choice that opened the row (ACCESSIBILITY.md §4).

With a mouse or touch, tap the row's title (‹) or the dimmed turn menu to go back. Tapping a
choice inside a row steps the highlight to it rather than jumping. A jump would reopen the
row as a new top-level menu and lose its way back.

To save presses:

- **Auto-draw:** when drawing is the only option, the game draws for you and says so.
- Rainbows are built for you, using real colors first and Wilds only for the gaps.
- **Rainbow Helper:** a ★ marks a good move. With **Tips + Shortcut**, that move is also the
  first choice in the menu.

## Interrupts never rush you

**Cloud Block** can be played on anyone's turn. When it's your chance to block, the prompt
speaks before anything is highlighted: "Misty plays Fog Skip on you. You have a Cloud Block.
Block it?" There is **no timeout**.

The **Block prompts** setting decides when you're asked:

- **When it affects me** (the default): only when the weather card hits you.
- **Always ask.**
- **Never ask:** you're never interrupted.

## Looking and listening

- **Look ▸** reads, whenever you ask, as often as you like:
  - your hand;
  - your rainbow progress, for example "5 of 7 colors plus 1 Wild. Still need 1 of green,
    indigo or violet.";
  - the other players;
  - the piles;
  - **What just happened**.

  Choosing one speaks it and shows it in big print above the choice bar. Like a key on a
  keyboard row, it then returns you to the turn menu with Look still lit, so Enter opens
  Look again.
- Every move by every player is spoken one line at a time and never cut off by the next scene.
- Your own scanning always cuts in. Anything you talk over can be replayed from What just happened.
- **Captions** show every spoken line in large print, for players who can't hear it.
- The **Rainbow Tracker** shows your progress with letters, checks, stars and stripes,
  never color alone.
- The first time each weather card comes up in a game, its rule is read after its name.

## Pause

**Pause is the last choice in every turn menu, every Block prompt and every pass-the-switch
screen.** While others play, the bar keeps **Look** and **Pause** available. No hold is
needed anywhere. Holding Enter for 5 seconds also pauses, and a ring appears from 2 seconds.

The game saves after every move. **Main Menu** and **Exit Game** keep the save, so **Continue
Game** picks up exactly where you left off. **Restart** asks first, with Keep Playing as the
first choice.

## Sharing the switch

Up to six people can take turns on the same Space and Enter. Computer players fill any
other seats.

- Before each person's turn, a **pass-the-switch** card hides the hand until that person
  chooses **Show my cards**.
- Private news waits for its owner and is read to them, not to the room. For example:
  "While you waited: Misty's Wind Trade took your Orange and gave you Day."
- **Open hands** turns the hiding off, for teaching or for playing alongside a helper.

## Range of players

- **Computer skill:** Easy, Normal or Hard. Computer players see only what a person at the
  table could see.
- **Rainbow Race:** the printed simple variant, using Colors and Wilds only.
- **House Rules:** choose the deck. You can add or remove each weather card, Sun & Rain, and
  Day & Night, choose where you draw from, and allow blocking a Block. All of it is set with
  the switch; no mouse is needed, so no warning dialog is needed either.

## Motion, sound and light

- **Animations:** Auto (follows the device), Full, Calm or Off. Calm keeps only gentle fades,
  with no rain, flying cards or spinning rings.
- **The big moments** borrow from mainstream card games. Each is decoration on top of the
  speech and captions, which carry the information.
  - **Callouts:** big words for big plays: "RAINBOW!", "BLOCKED!", "NIGHT, NIGHT!".
  - **Confetti:** bursts for combos, and confetti rain on a win.
  - **Reactions:** players react with an emoji bubble.
  - **"Your turn":** a sweep across the table.
  - **Foil:** a sheen on Wild, Day and Night.
  - **NEW:** a tag on cards you just picked up.
  - **Thinking dots:** shown while a computer player decides.

  Calm keeps the callouts and sweeps as gentle fades, and drops particles, foil movement
  and bumps. Off shows reactions standing still and nothing else.
- **The sky never flashes.** Lightning is a soft glow inside the clouds, at most one per
  1.2 seconds. The sky's overall brightness changes by no more than about 20% in a third of a
  second (WCAG 2.3.1). `tests/sky.test.cjs` checks this.
- **Sounds:**
  - Sounds heard every turn are short, soft and below 2.5 kHz.
  - Bright sounds are saved for rainbows and wins.
  - **Weather Sounds** turns rain, wind and thunder off separately from other sounds.
- **Text Size** goes up to 150%. Every panel is dark glass with white text, so the weather
  never reduces contrast.

## Phones

Phone-sized screens use a vertically scrolling table and menus. Hand cards wrap into
separate, tappable tiles; player seats, the Rainbow Tracker and choices wrap to the
available width. Menus keep the selected Text Size instead of scaling the whole menu
down. The layout allows space for notches and the home indicator in either orientation.

Switch scanning brings the highlighted choice into view automatically. Look answers
scroll to their first line, and new menus begin at the top; changing a setting keeps
the menu's scroll position. Desktop and tablet screens retain their existing layout.

## Settings

Text to Speech · Voice · Rainbow Helper · Block prompts · Turn pace · Auto-draw ·
Confirm discards · Captions · Animations · Text Size · **Auto Scan** · **Scan Speed** ·
Sound Effects · Weather Sounds · Reset Progress (two-step).

Text to Speech, Voice, Auto Scan and Scan Speed use the hub's shared managers. They stay
here because the game is also played outside the hub.
