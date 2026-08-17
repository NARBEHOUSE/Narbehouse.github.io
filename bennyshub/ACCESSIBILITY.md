# Building for Benny's Hub

**Read this before you write a line of code for this hub.**

Everything here exists so that one person can play a game by himself. Not "with
help." Not "with a caregiver driving the mouse." By themself. If a feature you
add cannot be reached with a single switch, it does not exist for the player
this hub is built for.

---

## 1. Who this is for

Benny's Hub was built by caregivers for Ben, who has TUBB4A‑related
Leukodystrophy (H‑ABC). It is now built for everyone in the same situation.

Assume your player:

- **Has one or two reliable voluntary movements.** That might be a hand, a
  cheek, a head turn, a knee. It is mapped to a switch, and that switch is the
  entire interface.
- **Cannot use a mouse, a touchscreen, a d‑pad, or a keyboard** in the ordinary
  way. No pointing, no dragging, no aiming, no two things at once.
- **May be slow to press, and slow to release.** A press might last a fraction
  of a second or four seconds, and that variation is not intentional.
- **May press by accident**, or twitch, or bump the switch — and the game must
  not punish that.
- **May not read**, or may not read quickly. Speech is not a bonus feature; for
  many players it *is* the interface.
- **Is not a child, and should not be talked to like one.** The games are real
  games with real difficulty. The access is what is adapted, not the dignity.

The disability is physical. Do not confuse "needs one switch" with "needs an
easier game."

### Build for the whole range, not one player

That said, "one switch" describes an input, not a person. The players who reach
this hub differ enormously — in stamina, in reaction time, in reading, in how
much challenge they *want*. A game pinned to a single difficulty will always be
frustrating for one end of that range and boring for the other.

Two things solve this, and both are already patterns in the hub:

**Difficulty and no‑fail modes.** Give the player a way to choose how hard the
game pushes back. Race Tracks ships a **Cruise mode** with no fail state at all,
sitting alongside a ten‑level Race ladder — same game, same controls, opposite
ends of the range. Bowling and Mini Golf let players pick opponents and player
counts. A no‑fail mode is not a lesser version of the game; for a player who
tires quickly or who plays to relax, it is *the* version.

**Editors.** Let players and caregivers build their own content. This is the
highest‑leverage accessibility feature in the whole hub, because it hands the
difficulty dial to the person who actually knows the player. Several games
already do it:

| Game | Editor |
| --- | --- |
| Benny's Mini Golf | course editor |
| Benny's Matchy Match | card‑pack editor |
| Benny's Show n Sound | panel/category editor |
| Trivia Master | full quiz builder |
| Benny's P3GL | level editor |

An editor turns one game into an unlimited number of them, tuned by a parent, a
teacher, or a therapist to the specific person in front of them — vocabulary
they're working on, pictures of their own family, a course short enough to
finish in one sitting. **When you build something new here, ask early whether it
can have an editor.** It is almost always worth it.

**Today's editors need a mouse and keyboard and are not switch‑operable.** That
is an accepted starting point — they are caregiver tools, and they earn their
place by what they let a caregiver build. But it makes the way *in* to them
dangerous for a switch user, so **every editor sits behind a spoken warning
dialog**. See §7, "Warn before a one‑way door" — that pattern is not optional.

The longer‑term goal is a player building their own content independently.

### Independence is the whole point

The measure of every screen in this hub is a single question:

> **Can the player get from the hub's front page, into this game, through every
> menu, into a round, out to the pause menu, into settings, and back to the hub
> — alone, using one switch?**

If the answer is no anywhere along that chain, that is a bug, and it is a more
serious bug than a crash. A crash is obvious. A screen that quietly requires a
second person is a player losing the ability to play by themself.

---

## 2. What a "switch" actually is

An adaptive switch is a large, forgiving button — sometimes a pad, a lever, a
proximity sensor, a sip‑and‑puff tube. It plugs into a **switch interface** that
emulates a keyboard, and that interface sends exactly one thing:

| Physical switch | What the browser receives |
| --- | --- |
| Switch 1 | `Space` keydown / keyup |
| Switch 2 | `Enter` keydown / keyup (also `NumpadEnter`) |

That is the whole hardware story. **A game that handles `Space` and `Enter`
correctly is switch‑accessible.** You never talk to switch hardware; you handle
two keys.

Three consequences that catch people out:

1. **A switch has no "click" — it has a press and a release, and they can be far
   apart.** Never act on `keydown` for a menu action. See §4.
2. **There is no third key.** Not Escape, not arrow keys, not letters. If your
   feature needs a third input, redesign the feature.
3. **Mouse and touch must also work, in parallel** — for caregivers, for
   therapists setting a game up, for players who do have touch or eye‑gaze.
   They are an *addition*, never the only route.

---

## 3. The two control schemes

The hub supports both, and every game must support both. The player chooses
once, in Settings, and the choice is remembered globally across every game.

### Two‑switch (Auto Scan **OFF** — the default)

The player drives both halves of the interaction.

- **Space** = move the highlight to the next item
- **Enter** = select the highlighted item

### One‑switch (Auto Scan **ON**)

The highlight moves *by itself* on a timer. The player only confirms.

- **The highlight advances automatically** every 1, 2, 3, or 4 seconds
- **Enter** = select whatever is highlighted right now
- Space still works for players who can hit it, but nothing *requires* it

The scan interval is the player's reaction budget. Someone who needs four
seconds is not being slow — that is their body's latency, and the setting exists
so the game meets it.

Auto Scan defaults to **off** and 2000 ms
(`shared/scan-manager.js`, `DEFAULT_SETTINGS`).

### In‑game, the same two schemes apply

This is where games differ most, and where the design work is. Race Tracks is
the clearest worked example (`apps/games/BENNYSRACETRACKS/js/ui.js`):

- **Two‑switch:** hold Space to steer left, hold Enter to steer right.
- **One‑switch:** hold Enter to move in the direction currently armed; releasing
  arms the opposite direction, so a quick tap swaps sides.

Note what that one‑switch mode does: it turns *one* button into a full
two‑direction control by making **release** meaningful. That trick — press does
one thing, release arms the next — is the single most useful pattern in this
codebase. Reach for it before you conclude a mechanic can't be done with one
switch.

---

## 4. The universal input contract

Every screen in the hub and every game obeys this. Deviating from it is how you
strand a player who has learned the pattern everywhere else.

| Gesture | Where | What it does |
| --- | --- | --- |
| **Space**, short press | Any menu | Move highlight forward — **on release** |
| **Space**, hold | Any menu | Scan **backwards**, repeating at the player's scan speed |
| **Enter**, short press | Any menu | Select the highlighted item — **on release** |
| **Enter**, hold | In‑game | Open the pause menu |
| Mouse click / tap | Anywhere | Same as selecting that item |

### Which of these numbers the scan manager actually owns

This trips people up, so be precise about it. **`NarbeScanManager` owns two
values and no others:**

- the **scan interval** — 1, 2, 3 or 4 seconds, the player's setting, which is
  also the repeat rate once backwards scanning has started
- the **250 ms input debounce**

**It does not own the hold thresholds.** There is no backwards‑scan threshold
and no pause threshold in `scan-manager.js` at all. Those are hard‑coded
separately inside each game — the same `3000` appears in at least thirteen
files under its own name (`longPress`, `SCAN_BACK_HOLD`, `HOLD_THRESHOLD`,
`BACKWARDS_SCAN_THRESHOLD`), and Bowling writes it as `3.0` seconds because it
runs off a Three.js clock.

Two consequences:

1. **The convention is ~3 s to start scanning backwards and ~5 s to pause**, and
   new games should match it — but it is a convention held together by
   copy‑paste, not a value anything enforces. A game can drift without breaking
   a build or failing a test. P3GL already has (§12).
2. **Never promise a specific duration in any text, player‑facing or not.** The
   repeat rate genuinely varies per player, and the threshold is whatever that
   particular game happens to hard‑code. "Hold Space to scan backwards" is true
   everywhere; "hold for 3 seconds" is true only until someone edits one file.

If these thresholds are ever worth standardising, the fix is to put them in
`scan-manager.js` next to the values it already owns.

### Never quote these numbers to the player

The thresholds above are for **you**, the implementer. Player‑facing text — help
screens, hints, footers, and anything spoken aloud — says **"hold Space to scan
backwards"** and **"hold Enter to pause."** No seconds, no numbers.

Two reasons. The repeat rate once backwards scanning starts follows the player's
own scan‑speed setting, so any number printed next to it is wrong for most
players. And a player who is told "hold for 5 seconds" and counts to five while
nothing visible happens will reasonably conclude it is broken — the ring and the
rising beeps are what communicate progress, not a number they read once.

Keep control hints to the shortest true sentence. Show n Sound's footer is the
house style:

> `Tap Space = next · hold Space = back · Enter = choose`

### Act on release, never on press

A player may hold a switch down for seconds without meaning to. If you fire on
`keydown`, a long press becomes a runaway repeat and the player loses control of
the screen. Fire on `keyup`, and check how long the press lasted:

```js
// Menu handling, the way every game in this hub does it
function onKeyUp(e) {
  if (key === 'Space') {
    if (heldLongerThan(3000)) return;  // that was a backwards-scan hold
    focusNext();                        // ordinary short press
  } else if (key === 'Enter') {
    activateFocused();
  }
}
```

### Why pause is a long hold

Pause has to be reachable from inside a game where both switches are already
doing something else. A long hold is the only gesture left that cannot collide
with gameplay. It is deliberately long enough that no one opens it by accident,
which means the gesture must be **discoverable while it happens** — otherwise
it is a secret.

Race Tracks does this properly and is worth copying: partway through the hold a
progress ring appears and starts filling, a **rising beep** plays each second so
it works with eyes closed, and the menu opens when the ring completes. The
player can see and hear that something is happening and that continuing to hold
will finish it.

Every game must also offer an **on‑screen Pause button** doing the same thing,
for mouse, touch, and caregivers.

### Debounce is handled for you — mostly

`shared/scan-manager.js` installs capturing listeners on `keydown`, `keyup`,
`mousedown`, `mouseup`, `click`, `touchstart`, and `touchend` and enforces a
**250 ms global cooldown** after any valid release. A switch that physically
bounces, or a player with a tremor who double‑hits, gets one clean press. You do
not need to write your own debounce, and you should not.

---

## 5. Shared modules

All live in `bennyshub/shared/` and are loaded by each game's `index.html`
before its own scripts. Load order matters: `safe-audio.js` first, then
`voice-manager.js`, then the rest.

### `scan-manager.js` — `window.NarbeScanManager`

The global scanning contract. **Settings persist across every game in the hub**
via `localStorage` (`narbe-scan-settings`), so a player configures their access
once, not twenty times.

```js
NarbeScanManager.getSettings()        // { autoScan, scanSpeedIndex, scanInterval }
NarbeScanManager.getScanInterval()    // ms: 1000 | 2000 | 3000 | 4000
NarbeScanManager.toggleAutoScan()
NarbeScanManager.cycleScanSpeed()
NarbeScanManager.subscribe(cb)        // fires when settings change, incl. from another tab
NarbeScanManager.getInputSensitivity() // the 250ms debounce constant
```

Subscribe rather than polling — the hub and games share settings live through
the `storage` event.

### `voice-manager.js` — `window.NarbeVoiceManager`

Text‑to‑speech, and the **single source of truth** for the chosen voice and
whether TTS is on. Never keep your own copy of that state; read it from here.

```js
NarbeVoiceManager.speak(text)
NarbeVoiceManager.getSettings()          // { ttsEnabled, ... }
NarbeVoiceManager.toggleTTS()
NarbeVoiceManager.cycleVoice()
NarbeVoiceManager.getCurrentVoice()
NarbeVoiceManager.getVoiceDisplayName(v)
NarbeVoiceManager.waitForVoices()        // promise — voices load async
```

Speak on **focus change** and on **selection**, and speak outcomes. Speech must
never block input.

### `safe-audio.js` — `window.SafeAudio`

Sound effects through plain HTML5 `<audio>`, deliberately **avoiding the Web
Audio API** — an `AudioContext` can take down the renderer in the Electron
desktop build. Same code, sound on web and desktop.

```js
SafeAudio.preload('roll', 'sound/roll.wav');  // file-backed
SafeAudio.preload('select');                  // NO url -> synthesised built-in
SafeAudio.play('select', 0.6);
SafeAudio.setEnabled(bool);                   // master mute
```

Built‑in synthesised names, no asset files needed: `select`, `hover`, `score`,
`bank`, `bust`, `fahtzee`, `win`, `lose`.

> **Trap, and it has bitten this repo:** `preload(name, url)` caches the entry on
> first call. Preloading a built‑in name with a URL that 404s permanently
> shadows the synthesised sound, and the failure is *silent* — no error, just no
> sound. If you want the built‑in, pass **no URL at all**.

### `ios-audio-fix.js`

Unlocks WebAudio and SpeechSynthesis on first touch for iOS/mobile. Include it;
nothing to call.

### `tutorial-modal.js` — `window.BennyTutorial`

The shared how‑to‑play modal, with an embedded video. Shows a "Video coming
soon" placeholder when a game has no video yet, so an unfinished tutorial is
never a blank black box.

---

## 6. How the hub itself works

`bennyshub/index.html` is the front door, and it is scanned with the same two
keys as everything else.

**Structure:** Home → Games *or* Tools → (optional Genre filter) → paginated
grid, **9 items per page** → launch.

**Games and tools are data, not markup.** The grid is built at runtime from
`apps/games/games.json` and `apps/tools/tools.json`. Adding a game means adding
a JSON entry — you do not hand‑write cards:

```json
{
  "id": "bennysracetracks",
  "title": "Benny's Race Tracks",
  "description": "A 3D racing game you steer with a single switch...",
  "path": "apps/games/BENNYSRACETRACKS/index.html",
  "image": "images/games/bennysracetrack.png",
  "genres": ["Racing", "Arcade"]
}
```

`genres` drives the hub's genre filter, so pick from the existing vocabulary
where one fits.

**Games run in an iframe** inside the hub, with a `← Back` button in the header.

**Exiting back to the hub** is a message, and all 20 games implement it:

```js
window.parent.postMessage({ action: 'focusBackButton' }, '*');
```

The hub listens for that and moves focus to its Back button, so the player's
next Enter press lands somewhere sensible instead of nowhere. **Any new game
must send this** when the player chooses "Exit Game" — otherwise the player
reaches the end of your game and is stranded with focus on a dead screen.

**Hub settings:** highlight colour, highlight style (outline or full), text
colour, background theme, UI size, TTS on/off, voice, Auto Scan, and scan speed.

---

## 7. The standard shape of a game

Every game in the hub follows the same skeleton. Match it — the consistency *is*
the accessibility. A player who learns one game has learned the shape of all of
them.

### Main menu
Reachable at launch, scanned with Space/Enter. Typically: Play / New Game, mode
or difficulty choices, **How to Play**, **Settings**, **Exit Game**.

### Settings
Reachable from the main menu, and again from the pause menu — because a scan
speed that turns out to be too fast has to be fixable *without abandoning the
round*. The canonical set, in this order
(`apps/games/BENNYSRACETRACKS/js/ui.js` is the reference):

| Item | Values |
| --- | --- |
| Text to Speech | On / Off |
| Voice | cycles available voices |
| *(game‑specific options)* | e.g. Direction Help, Ball Style, Theme |
| **Auto Scan** | `On — One Switch` / `Off — Two Switches` |
| **Scan Speed** | 1 s / 2 s / 3 s / 4 s |
| Sound Effects | On / Off |
| Reset Progress | two‑step confirm |
| ← Back | returns to previous screen |

Label Auto Scan with what it *means* — "One Switch" / "Two Switches" — not just
On/Off. It is the control‑scheme selector, and the person changing it is often a
caregiver setting the game up for someone else.

**Reset Progress must be two‑step.** A single mis‑scan should never erase
everything; the item arms first and only wipes on a second, deliberate select.

### Pause menu
Opened by holding Enter, or by the on‑screen Pause button. Standard items:
**Continue**, **Restart**, **Settings**, **Main Menu**, **Exit Game**, and where
useful a **Help** item that speaks a line without closing the menu.

### Persistence
Save progress as it happens, to `localStorage`. A player who gets tired
mid‑session should come back to where they were. Access settings are global via
the shared managers; game progress is the game's own.

### Warn before a one‑way door

**Any action that takes the player somewhere they cannot get back from with a
switch must be behind a confirmation.** This is the single most important
safety pattern in the hub, and it exists because of how scanning fails.

A scan cursor moves on its own, or moves on a press the player may not have
meant. A mis‑timed Enter is not a rare event — it is the normal failure mode of
switch access. If a mis‑scan lands on a menu item that opens a mouse‑only
editor, the player is now looking at a screen they cannot operate, cannot exit,
and did not ask for. Nobody is coming to help unless somebody happens to walk
past. That is the exact loss of independence this whole hub exists to prevent.

The editors are the main case. **They need a mouse and keyboard, and are not
switch‑operable.** Every game that has one already guards it:

| Game | On-screen | Spoken on open |
| --- | --- | --- |
| Trivia Master | Full overlay, plain wording | "Warning. Opening the game editor will leave this site." |
| Benny's Mini Golf | "Mouse Required" modal | the entire warning, verbatim |
| Benny's Word Jumble | "Warning: This feature requires a mouse or touch input…" | "Warning. This feature requires mouse input. Cancel. Proceed." |
| Benny's Show n Sound | "Continue (mouse needed)" | "The editor needs a mouse and keyboard." |
| Benny's P3GL | "…requires a mouse." | warns that it needs a mouse and that switch scanning will not work |
| Benny's Matchy Match | `editorWarning` menu state | warns that it needs a mouse and that switch scanning will not work |

Copy this when you add anything similar:

1. **Confirm first, always.** Never let a single select open a mouse‑only
   screen. Put a dialog in front of it.
2. **Put the safe option first in the scan order.** Cancel before Continue. If
   the player mis‑scans *again* inside the warning dialog, the accident should
   land on the way out, not the way in. Trivia Master and Mini Golf do this;
   Matchy Match currently lists Continue first, which is the wrong way round.
3. **Trap the scan inside the dialog.** While the warning is open, the scan list
   must contain only the dialog's own buttons — a warning you can scan straight
   past is not a warning. Trivia Master's `getScannables()` is the model: it
   returns the overlay's items and nothing else while it is visible.
4. **It must be spoken, the moment the dialog opens.** Not when the player
   scans onto an option — *on open*. Many players do not read, and for them an
   unspoken warning is not a weak warning, it is **no warning at all**: they
   see a screen change they cannot interpret and press their switch again.
   Speak the consequence before they can act on it.
5. **Say what will happen, in plain words.** "You will not be able to scan and
   select with your switch" beats "this feature is advanced." Name the thing
   they lose — scanning — not the thing the feature is.

Speaking only the option labels is not enough. A player hearing "Continue" and
"Cancel" has been told there is a choice, but not what makes one of them
dangerous.

The same applies to anything else that strands a switch user: leaving the site,
opening a new window, a file picker, or any external tool. If you cannot get
back with a switch, warn before going in.

---

## 8. Per‑game notes

All 20 games implement the §4 contract, the pause menu, the settings screen, and
the `focusBackButton` exit message. What varies is the *in‑game* input, which is
where each game's design work went.

| Game | In‑game input model |
| --- | --- |
| **Benny's Race Tracks** | Two‑switch: hold Space = left, hold Enter = right. One‑switch: hold Enter to move the armed way, release to swap sides. Optional star per level; Cruise mode is no‑fail. |
| **Benny's Bowling** | Space oscillates position, then aim, on a 5 s sweep — release to lock. Enter charges 0–3 s for power, non‑linear. Confirms on **release**, not press. |
| **Benny's P3GL** | Two‑switch: **hold** Space to sweep the aimer, release to stop — a short press only nudges it — and each new press reverses direction so the player walks it onto the target. One‑switch: the aimer oscillates on its own and Enter alone fires. Aimer Speed has four presets, defaulting to Super Slow. |
| **Benny's Baseball / Football** | Turn‑based play calling — scan the options, select. No reflex component at all; a full season is playable by menu choice. |
| **Benny's Basketball Shooter** | Oscillating power meter — the charge sweeps up and down, release to shoot. Same "stop the sweep" family as Bowling and P3GL, no reaction test. |
| **Pickleball Rally** | Rally returns via scan/select. Built with SCSU, student creator Lily Flack. |
| **Benny's Mini Golf** | Aim oscillation then power charge, same family as Bowling. Up to 4 players; includes a course editor. |
| **Benny's Battle Boats** | Two‑stage grid selection: scan the row, select, then scan the column, select. The standard way to reach a 2‑D grid with one switch. |
| **Chess & Checkers, Connect Four, Tic Tac Toe** | Same two‑stage grid selection; scan pieces/columns, select, scan destinations, select. |
| **Benny's Matchy Match** | Scan cards, select to flip. Memory, no timer. Includes a pack editor. |
| **Benny Says** | Simon‑style sequence repetition, deliberately **without** the timing pressure of the original. |
| **Benny's Word Jumble / Trivia Master** | Scan letters or answers, select. Trivia Master includes a builder for your own quizzes. |
| **Benny's Dice** | Select to roll, scan to choose which dice to keep. Yarkle, Fahtzee, Free Throw modes. |
| **Benny's Bug Blaster** | Tower defence — scan placement positions and upgrades, select. Turn‑paced, not twitch. |
| **Benny's Mega Slot** | Cause and effect: one press spins, immediate audio‑visual payoff. |
| **Benny's Show n Sound** | Cause and effect: a spinning‑wheel See 'n Say. Press to spin, hear the panel named. Phaser‑based. |

For in‑game specifics beyond this, each game's own source is authoritative;
Bowling additionally ships a full `README-ACCESSIBLE.md` documenting its
adaptation, and is a good model for what to write when you adapt someone else's
game.

---

## 9. Design rules

### Never require
- Timing precision, reflexes, or reaction tests
- Dragging, or holding one input while operating another
- More than two inputs, ever
- Reading, without speech as an alternative
- Two hands, or any specific limb

### Prefer
- Turn‑based and stepwise mechanics
- Oscillating aim the player *stops*, over aim the player *steers*. Offer both
  forms where you can: **player‑driven** (moves only while held, each press
  reverses — precise, but needs a hold) and **self‑driven** (sweeps on its own,
  one press commits — needs no hold). P3GL swaps between them with Auto Scan
- Make the speed of anything that moves on its own a **setting**, defaulted to
  the slow, accessible end — P3GL's Aimer Speed defaults to Super Slow
- Two‑stage selection (row, then column) to reach a grid
- Generous or absent time limits
- No‑fail modes alongside competitive ones — Race Tracks' Cruise mode is the
  pattern

### Visual
- High contrast by default; large targets (**≥ 64 px** on tablet)
- A highlight that is unmistakable — colour *and* thickness, not colour alone
- Never signal state with colour alone
- Generous spacing; a near‑miss scan step must not look like the right one

### Speech
- Speak on focus, on selection, on outcome, and on error
- Speak the *meaning*, not the label: "Auto scan on. One switch. Enter plays the
  game."
- Keep it short — it is read aloud at every scan step, and at a 1 s scan speed a
  long label becomes a drone
- Never block input while speaking

---

## 10. Shipping checklist

Before a game goes into `games.json`:

- [ ] Every action reachable with **Space and Enter only**
- [ ] Every action reachable with **Enter alone**, with Auto Scan on
- [ ] Menu actions fire on **release**, not press
- [ ] Holding Space scans backwards in every menu, repeating at the player's
      scan speed from `NarbeScanManager` — not a rate you picked
- [ ] Holding Enter opens pause **from anywhere in gameplay**, with a visible
      and audible indication while holding
- [ ] An on‑screen Pause button does the same
- [ ] Settings reachable from **both** the main menu and the pause menu
- [ ] Auto Scan and Scan Speed present, reading from `NarbeScanManager`
- [ ] TTS reads focus, selection, and outcomes, via `NarbeVoiceManager`
- [ ] Sound through `SafeAudio` — no `AudioContext`
- [ ] Reset Progress is two‑step
- [ ] Exit Game sends `postMessage({ action: 'focusBackButton' })`
- [ ] Mouse and touch work everywhere, and **no interaction requires a drag**
- [ ] Anything mouse‑only or off‑site sits behind a **spoken confirm dialog**,
      with Cancel first in the scan order and the scan trapped in the dialog
- [ ] Progress saves and resumes
- [ ] Readable at 100 % on a tablet
- [ ] Added to `apps/games/games.json` with a thumbnail and genres
- [ ] **Played start to finish with one switch, by someone who is not you**

That last one is the only test that actually counts.

---

## 11. Known gaps and traps

Honest notes for whoever works on this next.

**`narbe-input-cancelled` is listened for but never dispatched.** Ten games
register a handler for this event, and several carry comments explaining that
the scan manager fires it when it swallows a key‑up. **It does not.** Nothing in
`shared/` dispatches any custom event. The handlers are dead code today. They
are also harmless, because the debounce blocks a keydown and its matching keyup
together — so a game never sees an orphaned press. But if anyone ever changes
`scan-manager.js` to block a keyup whose keydown got through, games *will*
strand mid‑input (a held steer that never stops), and these handlers are the
intended safety net. Either wire up the dispatch or delete the listeners; do not
leave the comments claiming a contract that isn't implemented.

**`getInputSensitivity()` has gone missing twice.** It has been removed by a
revert and by a rewrite, and each time it silently broke Space/Enter in every
game that calls it — a `TypeError` inside a keyup handler, invisible to the
player, who simply finds the game unresponsive. If switch input dies across
multiple games at once, check this method exists before anything else.

**`developer-guide.html` used to disagree with the shipped code** — it described
hold‑Space as enabling *forward* auto‑scan and put the pause hold at 1.5 s.
Corrected to match what runs. If you find any other document quoting control
timings, this file is the authority; fix the other one.

**Sound that 404s fails silently.** Covered in §5, repeated here because it cost
real debugging time: a `SafeAudio.preload()` pointed at a missing file caches a
broken entry and permanently shadows the built‑in synthesised sound, with no
console error.

**Self‑hosted SVGs need explicit `width`/`height`.** A `viewBox` alone is enough
for Firefox and for plain `<img>` tags, but Chrome's WebGL texture upload needs
an intrinsic pixel size — a Phaser‑based game like Show n Sound renders a blank
panel instead. Same class of problem: cross‑origin images without
`Access-Control-Allow-Origin` blank out in WebGL games while working fine in
DOM‑based ones.

---

## 12. Known direction — do not "fix" these yet

Deliberate decisions and planned changes, recorded so the next person doesn't
either break them or duplicate the thinking. **None of these are open work
items.** The controls as they stand work, and changing them is not on the table
right now.

**Games reach pause differently, and that is currently fine.** Some offer an
on‑screen Pause button you scan to; others use the hold‑Enter gesture; most do
both. The inconsistency is accepted for now.

**One known deviation from the ~5 s convention:** P3GL uses a **2 s** hold to open
its menu when Auto Scan is on, and 5 s when it is off
(`this.autoScan ? 2000 : 5000`). No comment or commit message records why, and
it is the only game that varies the hold by control scheme. Worth a decision
when pause gets revisited — either it is a good idea that belongs everywhere,
or it should fall back in line with the rest of the hub. Do not assume it was
accidental, and do not assume it was deliberate.

**Where it is going: pause should become a scannable item everywhere.** Holding
a switch for five seconds is itself a physical demand, and some players cannot
sustain a hold at all — for them the hold gesture is not an accessible route to
pause, it is a locked door. The long‑term intent is for every game to expose
pause as something you can *scan to and select*, with the hold gesture kept as a
convenience rather than the only way in. When you build a new game, favour a
scannable pause entry; do not go retrofitting the existing ones yet.

**But understand the cost before you reach for it.** Making a control scannable
is not free — it puts another stop on the scan cycle, and the player passes
that stop on *every single pass*, for the whole session. A game whose only
in‑play control is "fire" lets the player sit there and play. Add a scannable
Pause, and now every shot means cycling past Pause to reach Fire. The player
who never pauses still pays for it, on every shot, forever.

So the honest trade is: **hold gestures cost nothing during play but exclude
players who cannot hold; scannable controls include everyone but tax every
action.** Neither is simply better.

P3GL is the worked example of the current answer. It was deliberately built
hold‑first — hold Space to aim, press Enter to fire, hold Enter for pause —
which keeps play down to the fewest possible switch presses. A scannable
aim‑to‑shoot button and a scannable Pause button are both straightforward to
add later and are wanted eventually, but they would put more steps between the
player and actually playing. **For now the hold‑based build is the right call
for this game, and it works.**

If you are weighing this for something new: prefer keeping the *primary
gameplay action* off the scan cycle, and put the scannable pause somewhere it
does not sit between the player and the thing they came to do. Or make it a
setting, so a player who needs the scannable route can turn it on and a player
who does not is not slowed down by it.

**Hold‑to‑charge mechanics will get a no‑hold alternative.** Benny's Baseball
charges the swing by holding, which suits most players but has the same problem
as above. The plan is a setting modelled on Benny's Football, where the player
**selects the type of swing** from a menu instead of holding to charge — same
game, no sustained press required. Not to be implemented now; it is recorded so
the next hold‑to‑charge mechanic gets designed with a menu alternative from the
start.

The pattern behind all three: **any interaction that requires holding a switch
should eventually have a select‑based equivalent.** Holding is an ability, and
not every player has it.

---

## 13. Licence and attribution

Source is MIT (see `LICENSE`). Individual adapted games may carry their own
licence — Benny's Bowling is GPLv3, inherited from the original project it was
built on. Check the game folder before you reuse it.

"Benny's Accessibility Hub," "NARBE," and "NARBE Foundation" are project
identifiers, and the MIT licence covers **code only** — it grants no trademark
rights. Forks must not imply endorsement or affiliation.

This is not medical software. It was made by a family, for a brother, and then
opened up because other families needed the same thing.

Dedicated to [@BEAMINBENNY](https://github.com/narbehouse).
