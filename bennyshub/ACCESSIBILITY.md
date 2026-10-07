# Building for Benny's Hub

For the web companion experiment, installation, connection diagnostics, provider
permissions and data management belong in the collapsed **Settings** area
at the top of the Hub. These controls use ordinary mouse/keyboard interaction
and stay outside switch scanning (`data-scan-exclude`). The original Streaming
editor stays behind its existing mouse/keyboard warning. Keep the player's main flow focused on opening and
using tools; companion troubleshooting must not become a required scan stop.
When a companion tool becomes unavailable, preserve work and offer a switch-
accessible **Back to Hub**, with technical detail inside the settings disclosure.

**Read this before you write a line of code for this hub.**

Everything here exists so that one person can play a game by himself. Not "with
help." Not "with a caregiver driving the mouse." By themself. If a feature you
add cannot be reached with a single switch, it does not exist for the player
this hub is built for.

---

## 1. Who this is for

Benny's Hub supports people who use one or two switches to access tools and games.

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
| NARBE Mini Golf | Course Creator |
| Benny's Matchy Match | card‑pack editor |
| Benny's Show n Sound | panel/category editor |
| Trivia Master | full quiz builder |
| Benny's P3GL | Campaign Editor |

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

For the great majority of hardware that is the whole story. **A game that
handles `Space` and `Enter` correctly is switch‑accessible.** You never talk to
switch hardware; you handle two keys.

### Why those two keys

They are not an arbitrary pick, and they are not a formal standard either. They
are the vendors' own default: AbleNet's Blue2 ships configured as Space and
Enter (switchable to 1/2/3/4), and Pretorian states plainly that "to provide
switch access to most AT software, Space and Enter is often all that you will
need." They also match the web platform — a native HTML `<button>` activates on
**both** Space and Enter — so the hub is using the two keys the browser, the
screen reader and every keyboard user already treat as "move on" and "choose."

The relevant standard underneath all of it is **WCAG 2.1.1 Keyboard**: every
function must be operable through a keyboard interface. Which keys is our call.

### The exception: interfaces that send no keys at all

Some hardware does not emulate a keyboard. AbleNet's **Hook+** uses Apple's
Assistive Switch Events, and anything driving **iOS Switch Control** or a
similar platform switch API works the same way — the operating system does the
scanning and delivers a *tap* to whatever is highlighted, and no `keydown` ever
arrives.

**This is why mouse and touch support is not a caregiver nicety.** It is the
entire access route for those players. A control that only responds to Space and
Enter is invisible to them; one that is a real, clickable element works. Treat
consequence 3 below as accessibility, not convenience.

One thing genuinely untested: platform Switch Control runs *its own* scan over
the page, which may collide with the hub's Auto Scan. Nobody has tried it. If
you have the hardware, that is a worthwhile afternoon.

Three consequences that catch people out:

1. **A switch has no "click" — it has a press and a release, and they can be far
   apart.** Never act on `keydown` for a menu action. See §4.
2. **There is no third key.** Not Escape, not arrow keys, not letters. If your
   feature needs a third input, redesign the feature. (There is no remapping
   setting either — §12 records why, and where it would go if ever built.)
3. **Mouse and touch must also work, in parallel** — for caregivers, for
   therapists setting a game up, for players who have touch or eye‑gaze, and for
   the platform‑switch‑API users above. For everyone else they are an
   *addition*; for those users they are the only route in.

---

## 3. The two control schemes

Every stationary choice scan supports both schemes. The player chooses once in Hub Settings. Gameplay retains each app’s existing modes; Auto Scan does not make every mechanic tap-only.

### Two‑switch (Auto Scan **OFF** — the default)

The player drives both halves of the interaction.

- **Space** = move the highlight to the next item
- **Enter** = select the highlighted item

### One‑switch (Auto Scan **ON**)

The highlight moves *by itself* on a timer. The player only confirms.

- **The highlight advances automatically** every 1, 2, 3, 4, or 5 seconds
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

## 4. The choice-scan input contract

The test for every scan: **"If Ben stops pressing, does anything in the game keep happening?"**

- **No: CHOICE.** Apply all three rules below to stationary board choices, answers, letters, rows, menus, results and confirmations.
- **Yes: MECHANIC.** Preserve controls, timing, physics, aim, charge, steering and existing pause routes. The choice policy does not run over it.

Classify each state, not the whole app. P3GL's optional stationary before-shot choices use **-1, Pause/Options, Take Shot**; aiming remains a mechanic. Racer's menus use choice policy; live steering and native multiplayer ownership stay intact. Single-switch gameplay can still require holds.

### Required park step

Every root choice loop includes a recurring blank **-1**, in both directions. There is no highlighted or actionable selection there. Skip disabled and hidden items.

| State | Behavior |
| --- | --- |
| Step, -1 | Silent; Enter inert. Space release reaches the first item; reverse scan reaches the last. |
| Auto, passing -1 | Parking Off passes silently for one full interval, with no park/parked speech or speech wait. With Park when chosen or Auto park, speak “park” when TTS is enabled and honor owned speech wait. |
| Park when chosen | Enter on Auto -1 parks. |
| Auto park | Park after the saved 1, 2 or 3 complete root loops; partial loops do not count. |
| Parked | Clear highlights, stop automatic movement, speak “parked” with TTS, show Parked. Enter resumes the first item without selecting. Preserve native hold-to-pause where provided. |

Reserve a status host outside the choices in the existing layout. Bring it into view on actual parking using the existing scroll container. Do not create another scrolling panel.

### Space brake

In ordinary one-player choice contexts, Auto Scan plus Space Brake On freezes **on keydown**, retaining the choice and its speech. This is the explicit act-on-release exception: waiting for release can cut off the label before the user stops the scan.

A short release stays paused. Enter still selects. A second Space tap resumes; a held Space resumes on release using that surface's existing hold threshold. Every resume waits one full scan interval. On -1 or while parked, consume Space without selecting. Brake Off preserves the surface's former Auto Space behavior.

Indicate scan pause only with a dotted outline on the selected choice. Do not add Paused text or a Paused badge. Canvas/3D choices need an equivalent outline anchored to the choice. Parked retains its visible status badge. Speak “Paused” only after the owned label ends normally; suppress it after cancellation, timeout, or a state change. Never interrupt the label for that notice.

Native multiplayer switches remain assigned to their players. Set brakeKeyAvailable:false wherever Space already selects for a player. Document and test the exception; never steal a player's switch for the brake.

### Wait for speech

With Wait for Speech On, advance after the current choice's own label completes **plus a full scan interval**. Input stays available. Other narration and stale tickets cannot release the clock.

NarbeVoiceManager.speak returns started, finished and cancel. Completion resolves on end, error, cancellation, disabled speech or a fallback estimated from text length/rate and capped at **10 seconds**. The cap settles the wait without itself cutting off long narration. Failed/disabled speech follows ordinary interval timing; failed native startup resolves within the fastest interval.

### Navigation and identity

- New menus, pages, results, confirmations and separate modals start at -1 with a full Auto interval. Owned title/park speech participates in Wait for Speech.
- In-place settings changes, including Auto on/off, retain the same stable item ID. Live redraws preserve identity, never merely the index, and never activate. If the item disappears, clear safely to -1.
- Predictive keyboard rows announce each available suggestion in display order, with pauses between words/phrases (and predicted letters where provided). Resolve the words from the current row when scanning onto it, including Auto, reverse and parent-row returns. Do not substitute a generic “Word predictions”/“Predictive text” label. Skip empty or disabled predictions; use “No predictions” when the row is empty. Keep the announcement on the scanner’s owned speech ticket so Wait for Speech covers the full row.
- Back within a nested task restores the parent row/item by identity. A keyboard key returns to its prior row. Separate modal returns may explicitly start a fresh blank menu.
- Only the root owns -1: the blank between the last row and the first (text) row, and the only place parking happens. Every row the player enters (keyboard rows, phrase, channel, message and calendar rows, and game row-then-item grids) is entered with `enterGroup(children, {wrap:true, backStop:true})`. It loops continuously in both directions, including held-Space reverse scanning and Auto scanning, through its items plus one Back stop after the last item; scanning past either end never leaves the row. On the Back stop no item is highlighted: a dashed outline (not the filled row highlight) surrounds the row’s visible items and speech says “Back”; choosing it returns to the same row in row mode with its normal highlight, never the top. Space on the Back stop is consumed without pausing, as on the root blank. Rows have no visible Back buttons of their own. Selecting an item or the existing hold-Enter Back still returns to its row, and row-local cycles do not count as root parking loops. `choice-scan-adapter.js` adds the stop (the Keyboard tool, which drives the controller directly, appends its own `kind:'back'` item), so `choice-scan.js` and the Companion's synced copy are unchanged. A child group entered without either option would still finish its loop at root -1; no current surface does that.
- Clear half-held key state and timers on blur, cancellation and ownership changes. Typing, native dialogs, editors and gameplay own their input while active.

### Input guard and native holds

Ordinary choices act on release. Step Space advances; held Space scans backward at the saved interval. Preserve each surface's existing Space/Enter hold thresholds and native pause feedback. Do not promise a universal hold duration in player hints.

NarbeScanManager owns Auto, interval (1/2/3/4/5 seconds), sensitivity (50/100/200/300 ms), parking, loops, brake and speech wait. It does not own native hold thresholds.

Sensitivity is a cooldown and anti-rapid-press filter, **not a minimum press length**. A valid short press counts. Rejected keydown and matching keyup are consumed together. Do not add a second debounce, a 500 ms activation gate or desktop's old minimum-hold filter. Mouse and touch remain direct navigation.

### Central settings

Auto Scan, Input Sensitivity and Scan Speed share the first Scan row. Scan Speed stays enabled with Auto Scan on or off because it also controls held backward scanning.

Only Hub Settings exposes Parking, Loops Before Parking, Space Brake and Wait for Speech. Keep them visible with descriptions and disabled when Auto is off; Loops also requires Auto Park. Disabled options retain saved values and are skipped by scanning. Use ordinary page scrolling, without a nested Settings panel.

Apps retain their existing local Auto, voice and speed controls backed by the managers. Settings update live across Hub, frames, tabs and Companion without resetting selection.

---

## 5. Shared modules

All live in `bennyshub/shared/`. Load `platform.js`, `scan-status-badge.js` and `choice-scan.js` before the managers and app code. Load `choice-scan-adapter.js` before an app bridge that uses it. Retain existing SafeAudio ordering.

### `scan-manager.js` — `window.NarbeScanManager`

The global scanning contract. **Settings persist across every game in the hub**
via `localStorage` (`narbe-scan-settings`), so a player configures their access
once, not twenty times.

```js
NarbeScanManager.getSettings()        // Auto, interval, sensitivity, parking, loops, brake, speech wait
NarbeScanManager.getScanInterval()    // ms: 1000 | 2000 | 3000 | 4000 | 5000
NarbeScanManager.toggleAutoScan()
NarbeScanManager.cycleScanSpeed()
NarbeScanManager.subscribe(cb)        // fires when settings change, incl. from another tab
NarbeScanManager.getInputSensitivity() // 50 | 100 | 200 | 300 ms cooldown; no minimum hold
```

Subscribe rather than polling — the hub and games share settings live through
the `storage` event.

### Choice controller and platform boundary

Use NarbeScanManager.createChoiceScan with choice:true, the existing holdThreshold, stable getId/getLabel mappings, a statusHost outside the scan list, and explicit highlight/select callbacks. Forward events after the shared guard. The controller adds no key listeners or debounce. Use open for fresh menus, setItems for redraws, enterGroup/back for nested tasks, and suspension when another surface owns input.

NarbeChoiceScanAdapter.create is an optional explicit app bridge. Contexts supply stable keys and items with id, label and optional element/labelElement. It provides sync, enterGroup, back, align, cancelInput and disposal, without polling the DOM. Canvas/3D apps keep their own rendering.

NarbePlatform isolates settings storage/transport, speech engine events, key capture and lifecycle. Shared policy must not directly access browser storage, Electron IPC or native speech/key APIs. The later Electron pass supplies the same contract; no platform branches belong in shared managers.

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

**Exiting back to the hub** is a message, using this message:

```js
window.parent.postMessage({ action: 'focusBackButton' }, '*');
```

The hub listens for that, closes the game, and returns to the launch menu with
nothing highlighted. The first Space starts scanning again (§4). **Any new game
must send this** when the player chooses "Exit Game" so they can return using
the same switches.

**Hub settings:** highlight colour, highlight style (outline or full), text
colour, background theme, UI size, TTS on/off, voice, Auto Scan, scan speed, Input Sensitivity, Parking, Loops Before Parking, Space Brake and Wait for Speech.

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
| *(game‑specific options)* | e.g. Direction Help, Ball Style, Theme — and any timing/hold toggle §9 calls for |
| **Auto Scan** | `On — One Switch` / `Off — Two Switches` |
| **Scan Speed** | 1 s / 2 s / 3 s / 4 s / 5 s; default 2 s |
| Sound Effects | On / Off |
| Reset Progress | two‑step confirm |
| ← Back | returns to previous screen |

Label Auto Scan with what it *means* — "One Switch" / "Two Switches" — not just
On/Off. It is the control‑scheme selector, and the person changing it is often a
caregiver setting the game up for someone else.

The four new scan preferences live only in Hub Settings; do not duplicate them in app settings.

**Reset Progress must be two‑step.** A single mis‑scan should never erase
everything; the item arms first and only wipes on a second, deliberate select.

### Pause menu
Preserve the game’s existing hold-to-pause and on-screen Pause routes. A hold-only route may be unavailable to a player limited to short taps; record that limitation accurately. Standard items: **Continue**, **Restart**, **Settings**, **Main
Menu**, **Exit Game**, and where useful a **Help** item that speaks a line
without closing the menu.

In a new game, prefer making Pause something the player can also **scan to and
select**, with the hold kept as a shortcut. §12 covers what that costs and when
it is the right call.

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
| NARBE Mini Golf | "Mouse Required" card | the entire warning, verbatim |
| Benny's Word Jumble | "Warning: This feature requires a mouse or touch input…" | "Warning. This feature requires mouse input. Cancel. Proceed." |
| Benny's Show n Sound | "Continue (mouse needed)" | "The editor needs a mouse and keyboard." |
| Benny's P3GL | "Mouse needed" card | the entire warning, verbatim |
| Benny's Matchy Match | `editorWarning` menu state | warns that it needs a mouse and that switch scanning will not work |

Copy this when you add anything similar:

1. **Confirm first, always.** Never let a single select open a mouse‑only
   screen. Put a dialog in front of it.
2. **Put the safe option first in the scan order.** Cancel before Continue. If
   the player mis‑scans *again* inside the warning dialog, the accident should
   land on the way out, not the way in. Trivia Master, NARBE Mini Golf and
   Matchy Match put the safe option first.
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

The current web catalog contains **26 games**, verified against `apps/games/games.json`. Section 4 governs their stationary choices; native pause access and gameplay controls vary by game. See §12 for scannable pause routes and their limits, and SCAN-UPGRADE-CHANGES.md for the verified surfaces and mechanical exclusions.

| Game | In‑game input model |
| --- | --- |
| **Benny's Race Tracks** | Two‑switch: hold Space = left, hold Enter = right. One‑switch: hold Enter to move the armed way, release to swap sides. Optional star per level; Cruise mode is no‑fail. During racing, switch pause requires holding Enter; the on-screen Pause button is clickable but is not a scan choice. |
| **NARBE Racer (NARBE Kart / `NARBEKART`)** | Automatic acceleration. **Hold to Slide**: two switches steer left/right with Space/Enter; one switch holds to slide the armed way and releases to reverse it. **Press to Step**: two switches move one lane left/right on press; one switch selects the highlighted lane from the moving five-lane scan. Two-player play gives each player their own switch. Live-race pause remains hold-dependent (Enter, or either player's own switch); the clickable Pause button is not a scan choice. Cup/track selection carries the brief-taps pause-access notice. |
| **Benny's Ballista** | Scan ammunition, then use **Easy Aim** to scan numbered targets and select to fire. **Pause is a scan choice on the ammo, Easy Aim and flight screens**, alongside zoom/change-ammo choices where available. Manual aiming instead holds Space to turn (each press reverses), then holds Enter to charge and releases to fire. Native Enter pause holds remain: 5 s in ordinary contexts, 7 s during manual aiming/charging. Includes the Castle Workshop. |
| **Benny's Bowling** | Every ball starts with a scan between the bowling ball and Pause. Selecting the ball starts the shot: manual Space holds move position, then aim; release locks each. In Auto, position and aim sweep by themselves and Enter locks them. The full oscillation period is 20 s in manual mode and 10 s in Auto. Enter charges power and releases to bowl. Pause is a scan object before the shot; the charge remains a mechanic. |
| **Benny's P3GL** | Three modes — Cozy (never runs out of balls), Vivid and Hyper — each with three 20-level campaigns. Two-switch: hold Space to sweep aim, release to stop; each new press reverses direction. Release Enter to fire. One-switch: aim sweeps at the Aim speed; press Enter to freeze it and release to fire. **Before Each Shot: Aim right away / Choose Play or Pause** optionally adds blank, Pause/Options, Take Shot before each shot. Without that choice, Enter holds pause (2 s in Auto, 5 s otherwise); with it on, use the Pause choice. Aim speed defaults to Super slow. Includes a Campaign Editor. |
| **Benny's Baseball** | Turn-based play calling and field choices include Pause. **Batting: Pick a Swing** is the default without a saved preference: select Ready to Swing, hear the pitch, then scan Normal, Power, Bunt, Take Pitch or Pause while the ball waits near contact. **Hold to Charge** remains optional: 0–2 s bunt, 2–4 s normal, 4–6 s power, released against the pitch. §12 describes the no-hold route. |
| **Benny's Football** | Scan play calls and receivers. Normally hold Enter to charge throws; field goals aim, then charge. **Easy Throw** removes the charge: select the receiver to throw at ideal power, or lock the aim to kick at ideal power. Pause is a scan choice in play calling and receiver selection. |
| **Robot Football** | Scan play calls and receivers. Throws/kicks can charge on Enter and release; **Easy throw** (Basic) / **Charge throws and kicks** (Advanced) makes charging optional. Two-switch running holds Space left/Enter right; one-switch running holds Enter in the armed direction and releases to swap. Advanced **Run controls: Choose direction** waits between short movement bursts. Pause is scannable in the playbook, receiver selection, return choices, results and Choose direction controls; live hold-steering and kick mechanics keep their own input. |
| **Benny's Basketball Shooter** | Two-switch: hold Space to sweep aim, release to stop; each new press reverses direction. With Auto Scan on, aim sweeps by itself. Hold Enter to fill a tall power meter and release to shoot. A green sweet-spot bracket marks a perfect release: low and wide for close shots, higher and narrower for long ones (**Sweet Spot: Fixed** keeps it mid-bar). **Shot Helper** slows the fill near the bracket and dings inside it. Holding Enter for 10 s pauses; the Pause menu includes Help. Modes: the 12-shot Shootout, which stops after each shot to scan **Take Shot** or **Pause**, and 2-player HORSE, whose shooting spot is chosen from a scanned list ending in **Pause** (Main Menu sits inside Pause, so one stray select can't end the game). Continue returns to the same menu; pausing while the ball is in the air opens once the shot is over. |
| **Pickleball Rally (original, linked from Robot Pickleball credits)** | Rally returns via scan/select. Switch pause uses an Enter hold; the visible Pause button is clickable, not part of the gameplay scan. Built with SCSU, student creator Lily Flack. |
| **NARBE Robot Pickleball / Rally Club** | Automatic forehand, backhand, low and overhead returns, contact quality and short/deep positioning. Default: hold Space left / Enter right; release stops. Each fresh one-switch Enter hold heads toward the incoming return, with a matching NEXT HOLD/HOLDING arrow and READY when aligned; Hub Auto Scan enables Enter-only play automatically. Tap input moves to the incoming ball and stops at paddle alignment without overshoot. After input and alignment, one-switch/tap play finishes the remaining bounced approach promptly and continuously. Matches automatically advance through opponents, preserving Serve/Pause without an opponent picker or result menu. Automatic movement also available. Full speed removes the slowdown; Relaxed/Slow motion give more time; No-fail and Just rally stop an unreachable ball until reached and show no competitive score or target stars. Every rally starts with a shared blank Serve/Pause choice; No-fail and Just rally also break there after six returns without awarding a point. **Serve aim:** choosing Your serve aims inside the legal diagonal service box, which glows on court with a target, flight arc and direction chevron. Two-switch: hold Space to move the target, release to stop; each new hold reverses; Enter serves. One switch and Tap: the target sweeps by itself; Enter stops it on the press and the release serves. A continuous six-second Enter hold pauses instead. Robot serves need no aim. Mouse/touch drags the target and releasing serves. Enter never pauses on a short gameplay press; six-second continuous Enter pause (also Space in One switch), Escape and pointer Pause. Continue has neutral styling. Traditional singles server-only scoring, service changes and 11/win-by-two. Both robots keep the paddle arm on a fixed shoulder with fixed-length upper arm and forearm; footwork steps (eased, never a jump), crouch and torso turn give the reach, and robots walk to their serve spots between points. First person looks out through the player robot's visor and briefly follows the ball onto the paddle. Mouse/touch positioning (the robot runs to the dragged spot), saves and Lily’s original link retained. |
| **NARBE Mini Golf** | 3D. Two-switch: hold Space to turn aim (each press reverses), hold Enter to charge and release to putt. One-switch: aim sweeps by itself and Enter stops it. Hold Enter to pause. **Easy Pause**, off by default, starts every turn with a scan between the putter and Pause. Power can also be chosen from a list (which includes Pause) or set to Automatic. The aim view stays still while aiming. Up to 4 players; includes a Course Creator. |
| **Benny's Battle Boats** | Two-stage grid selection: scan the row, select, then scan the column, select. The standard way to reach a 2-D grid with one switch. |
| **Benny's Chess and Checkers** | Scan selectable pieces, select a piece, then scan its legal destinations or Cancel. |
| **Benny's Connect Four** | Scan available columns and select to drop a piece; there is no separate row-selection stage. |
| **Benny's Tic Tac Toe** | Scan empty cells directly and select to place a mark. |
| **Benny's Matchy Match** | Two-stage grid selection over the card layout — scan the row, select, then scan the card, select to flip (`scan.mode` toggles `row`/`col`). Memory, no timer. Includes a pack editor. |
| **Benny Says** | Simon-style sequence repetition, deliberately without the timing pressure of the original. |
| **Benny's Word Jumble** | Scan unused letters, the sentence readout and filled slots; select to place/remove a letter or hear the sentence. Switch pause uses an Enter hold; the clickable Pause button is outside that scan list. |
| **Elouise's Word Search** | Scan a row, a starting letter, then an available direction; extend along that direction to choose the word. The row scan also includes the spoken word bank and Pause. Later stages offer Back, and a long Enter backs out of the attempt rather than pausing. Includes a word-list editor. |
| **Trivia Master** | Scan answers and select. Pause follows the last answer on the game screen; there is no hold-to-pause, and a long Enter press selects. Includes a quiz builder. |
| **Benny's Dice** | Free Throw, Yarkle and Fahtzee. Scan Roll and other available actions, including Pause; Fahtzee also scans dice to keep, while Yarkle keeps scoring dice automatically. Scanning waits during rolling, initiative and CPU turns. |
| **Benny's Bug Blaster** | Tower defence — scan placement positions and upgrades, select. Turn-paced, not twitch. |
| **Benny's Mega Slot** | Scan Spin, bet controls, Auto Play and Pause during ordinary play. Bonus mechanics retain their own input. A spin gives an immediate audio-visual payoff. |
| **Benny's Show n Sound** | Cause and effect: a spinning-wheel See 'n Say. Press to spin, hear the panel named. Phaser-based. |
| **NARBE Animal Friends** | Scan the reveal action in Peekaboo play, or animal choices in the other play modes, then select on Enter release. Pause is always last in the play scan and remains available while an animal reveal is busy. Space steps, or Auto advances for one-switch play. No score, deadline or losing. |
| **Benny's Fish Mystery** | Aim and charge the cast by scan, then press to set the hook while the take is on and hold to reel, easing off on a run. Timed on the hook, hold-based on the reel; §9 governs both. The world/scene scans end with **Options**, opening pause, settings and the route back; fishing and boat mechanics retain their native controls. Three.js, with a content editor. |

**Benny's Mini Golf (`BENNYSMINIGOLF`)** is a separate legacy direct-URL build; the catalog's NARBE Mini Golf points to `NARBEMINIGOLF` instead.

For in‑game specifics beyond this, each game's own source is authoritative;
Bowling additionally ships a full `README-ACCESSIBLE.md` documenting its
adaptation, and is a good model for what to write when you adapt someone else's
game.

---

## 9. Design rules

### Choice interfaces must not require
- Timing precision, reflexes, reaction tests, or a sustained hold **as the only
  way through** — these are allowed as *a* route, never as the only one. See
  "Timing and holds: preserve play and add options where practical" below
- Dragging, or holding one input while operating another
- More than two inputs, ever
- Reading, without speech as an alternative
- Two hands, or any specific limb

### Timing and holds: preserve play and add options where practical

Existing aiming, charge, steering, fishing and timing mechanics remain valid. The scan upgrade does not replace them. Aim for an additional tap-friendly route where it can preserve the game; retain the current control mode, default, scoring, physics and difficulty. Some games may continue to require holds. A later per-game decision can choose an optional alternative or an accurate hold-required notice. Neither is automatically required to complete this scan pass.

Fish Mystery, Bowling and remaining Mini Golf hold paths are internal follow-ups. Racer has the separately approved pause-access notice. The ideas below guide future explicitly scoped options; they do not authorize gameplay changes now.

**Separate the decision from the execution.** This is the whole method, and it
is easier than it sounds. Almost every timed action in a game is two things
stacked together:

- **A decision** — which receiver, what kind of swing, where to aim, whether to
  take the shot at all. This is the interesting part, and the player should keep
  making it.
- **An execution** — holding for the right duration, releasing on the right
  frame, pressing inside a window. This is the part that tests the body rather
  than the judgement, and it is the part the toggle removes.

**Keep the decision. Drop the execution.** Football is the clean example: the
decision is *which receiver*, and the player scans and selects one either way.
With the charge on, they then hold to set power. With **Easy Throw** on, the
selection is the whole action — pick the receiver and it throws at ideal power.
Nothing about the choice changed; only the wrist did.

So the three common shapes resolve like this:

| Timed form | What is left when the execution comes out |
| --- | --- |
| **Hold to charge**, release for strength, power or distance | The selection that was already there carries the action on its own and the game supplies the power (Football's Easy Throw). Where the power level *was itself* the decision, name the levels and let the player scan them — Bunt / Normal / Power, Light / Normal / Full |
| **React inside a window** that opens and closes on its own | Hold the window open until the player selects. The decision survives; the deadline does not |
| **Hold to sustain** something — a reel, a throttle, a brake | Resolve it in discrete steps, one press per step, or as a single select that plays out on its own |

**The game still resolves the outcome.** A selected swing is not an automatic
hit and a selected hook is not a guaranteed fish. The choice goes into the same
resolution the timed version fed, alongside difficulty, position, and luck —
exactly the way a turn‑based play call already resolves. The player chose; they
did not skip.

**Two options is the whole shape of it.** The setting is a toggle, not a
difficulty ladder: charge, or do not charge. Do not add a menu step that decides
nothing — if the action already has a selection in it, that selection *is* the
no‑hold version, and the toggle just stops asking for the hold afterwards.

**Benny's Football is one shipped example.** Baseball's Pick a Swing and Mini
Golf's power choices also provide alternatives (§8). Football throws by
scanning the receivers and selecting one; with the charge on, a hold then sets
the power. **Easy Throw** in settings drops that second half — select the
receiver and it throws at ideal power, and field goals kick at ideal power once
the aim is locked — so a full season plays with no sustained press anywhere. It
is offered in both the main‑menu and the pause settings, it persists, and it is
spoken on toggle. That is the shape to copy. The one thing to do better is the
name: "Easy Throw" labels the player rather than the mechanic, and only the hint
underneath says what actually changes.

**A setting is what lets both players have what they need.** §12 sets out the
honest trade: a hold keeps play quick and direct for a player who can manage
one, and shuts out a player who cannot, while putting a control on the scan
cycle lets everyone in and adds a step in front of every action for the rest of
the session. A toggle settles that instead of dodging it — the player who needs
the select route turns it on, and the player who does not is never left waiting
on a step they will never use. That is why this rule asks for *a setting*, not
for "make everything scannable." It is usually a smaller change than it sounds,
too: the select form appears **at the moment it is needed** — a swing menu when
the pitch comes — rather than becoming a permanent stop on the way to every
shot.

**Where the setting lives.** It is an ordinary game‑specific settings item, in
the slot §7 reserves for them, and it must be reachable from **both** the
main‑menu settings and the pause‑menu settings. A player who discovers
mid‑round that they cannot meet the window has to be able to fix it without
abandoning the round — the same reason Scan Speed appears in both places.
Persist it with the game's other settings.

**Label it by what it changes, not by who it is for.** "Swing: Hold to Charge /
Pick a Swing" tells a caregiver exactly what will be different. "Easy Mode"
tells them nothing, and tells the player something untrue about themselves.

**Not every game here does this yet, and that is worth saying plainly.** The
hub was built around what Ben can do. The controls were tuned to one person's
movements, and that is why they work as well as they do — they were tested
against a real body every day, not against a guideline. The reach turned out to
be much wider than one player, which is the whole reason the hub was opened up.

But building around one person's capabilities means the places where other
people's differ did not always get designed for. Charge‑and‑release is the
clearest case: it suits Ben, it suits a lot of players, and for a player who
cannot sustain a hold it is simply a closed door. That is not a flaw in the
games — they do what they were built to do — it is the next thing to build.

So: **some shipped games do not have the alternative yet, and will get it.**
Which ones still owe a toggle, and what each toggle is planned to be, lives in
§12 — that is where current status belongs, and it will go out of date as the
work lands. This section is the rule going forward. It applies to anything built
from here on, and it is the direction the existing games are moving in.

**Default to the reachable form in anything new.** Same reasoning as P3GL's
Aim speed defaulting to Super slow: a player who cannot meet the window may
never get far enough into the game to find the setting that would have let them
in, while a player who wants the timed version will find it in the first
minute. A game that already shipped with the timed form keeps its current
default when the setting is added, so nobody's game changes under them.

**What this rule does not overturn.** Some sustained holds in the hub have no
alternative today, and this rule does not retroactively make them bugs:

- **Hold Space to scan backwards** and **hold Enter to pause** — the §4 contract
  gestures. Backwards scan is a shortcut, not a requirement; the forward scan
  reaches everything on its own. Pause is the real gap, and §12 carries both the
  reasoning and the direction for it.
- **Controls where the hold *is* the control** rather than a charge laid on top
  of one — Race Tracks' hold‑to‑steer, P3GL's hold‑to‑sweep. These are
  continuous inputs, not timed windows, and §12 explains why the hold‑first
  build is the current answer for them.

Those are known, recorded, and not open work. The rule governs what you build
from here, and it is the direction the rest is moving in — it is not an
instruction to go retrofitting.

**This is not a licence for reflex games.** The timed form still owes
everything else in this document — it fires on release, it needs no drag, no
second limb, no third input, and an accidental press must not cost the player
anything they cannot recover from. And the toggle is not a way to defer the
design: if you cannot describe how the game plays without the timing or the
hold, the mechanic is not ready to build.

### Prefer
- Turn‑based and stepwise mechanics
- Oscillating aim the player *stops*, over aim the player *steers*. Offer both
  forms where you can: **player‑driven** (moves only while held, each press
  reverses — precise, but needs a hold) and **self‑driven** (sweeps on its own,
  one press commits — needs no hold). P3GL swaps between them with Auto Scan
- Make the speed of anything that moves on its own a **setting**, defaulted to
  the slow, accessible end — P3GL's Aim speed defaults to Super slow
- Two-stage selection to reach a grid — Battle Boats, Matchy Match and
  Elouise's Word Search scan rows then cells; Chess & Checkers scans pieces
  then legal destinations. Connect Four scans columns directly; Tic Tac Toe
  scans empty cells
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

- [ ] Classify every state with the CHOICE/MECHANIC question in §4.
- [ ] Every root choice loop visits silent Step -1 both ways; Enter is inert there.
- [ ] Auto passing, chosen parking and 1/2/3-loop parking work; parked Enter resumes without selecting.
- [ ] Preserve native long-hold pause while parked and multiplayer switch ownership.
- [ ] Brake freezes on press, preserves label speech, marks the selected choice, and resumes after a full interval.
- [ ] Brake Off preserves the former Auto Space behavior.
- [ ] Speech wait handles end/error/disabled/cancelled/timeout without hangs or stale movement.
- [ ] Auto/settings changes and redraws retain stable identity; removed items clear safely.
- [ ] Nested Back restores the same row/item; documented fresh returns open at -1.
- [ ] Valid short releases work without another debounce or minimum press length.
- [ ] No key/timer state leaks across blur, modal, typing or gameplay ownership changes.
- [ ] New global controls remain central-only, visible-disabled, with ordinary page scrolling.
- [ ] Existing gameplay, defaults, timing, difficulty, art and sound remain intact.
- [ ] Destructive actions require confirmation; exits return to Hub.
- [ ] Status/layout stays readable at tablet, narrow and short-window sizes.
- [ ] Record the actual surfaces tested and engine/device limitations; a page-load check is insufficient.
- [ ] A person using the intended switch setup tests the complete play path before final release.

Gameplay alternatives are separate opt-in work. Keep existing hold mechanics and tap alternatives. Record unresolved hold requirements internally; any player-facing notice needs accurate per-mode wording.

---

## 11. Known gaps and traps

Honest notes for whoever works on this next.

**Historical input-port trap, before this choice upgrade:** Some games already
registered `narbe-input-cancelled` handlers for the desktop scan manager's
rejected presses. The web build did not use desktop's minimum-hold check.

**This was tested the hard way.** The Input Sensitivity port briefly brought
desktop's minimum-hold check across, swallowing the keyup of a too-short
press. In that historical twenty-three-game survey, twelve games had no
`narbe-input-cancelled` handler and could strand held state: Benny Says set
`spaceIsDown` on keydown and only cleared it on keyup, so a swallowed keyup
left it scanning backwards forever. Bowling, which already had the handler,
was fine. The check was removed again the same day. Those counts describe
that earlier port, not current handler coverage.

So the position is:

- **Do not add a minimum-hold check.** The current web contract accepts valid short presses. Blocking a keyup whose keydown already reached the game is the bug.
- **All current web games and tools register the handler**, in their app input code or choice bridge: all 26 catalog games, the separate legacy Mini Golf build and all six tools. Keep those handlers as the safety net for cancelled input; there is no current missing-game list.

**`getInputSensitivity()` kept going missing, and now we know why.** It was
removed by a revert and by a rewrite, and each time it silently broke
Space/Enter in games that call it — a `TypeError` inside a keyup handler,
invisible to the player, who simply finds the game unresponsive.

The cause was not carelessness. Until the Input Sensitivity port, the web build
of `scan-manager.js` had a **stub**: a getter with no setter, returning a
hard‑coded constant, with nothing in the hub able to change it. It read exactly
like dead code, so it kept getting pruned. The working version had always been
in the desktop hub; the web fork simply never received it.

It is now a real setting, so the incentive to delete it is gone. If switch input
dies across multiple games at once, still check this method exists first.

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

**Games reach pause differently, and that is currently fine.** A clickable
Pause button is not automatically a switch scan choice. The current scannable
routes are:

| Game | Scannable pause route |
| --- | --- |
| NARBE Mini Golf | **Easy Pause**, off by default, adds putter/Pause before each turn. The separate power-choice list also includes Pause. |
| Benny's Ballista | Pause on ammo, Easy Aim and flight screens. Manual aiming/charging still uses the native hold route (7 s there; 5 s in ordinary contexts). |
| Benny's P3GL | **Before Each Shot: Choose Play or Pause** adds Pause/Options before aiming; this setting disables the native hold-to-pause. |
| Benny's Bowling | Ball/Pause scan before each shot; position, aim and charge remain mechanics. |
| Trivia Master | Pause after the last answer, on the game screen only. |
| Benny's Baseball | Pause in field/play choices and the frozen-pitch Pick a Swing menu. |
| Benny's Football | Pause in play calling and receiver selection. |
| Robot Football | Playbook, receiver selection, return choices, results and the optional Choose direction movement controls. |
| NARBE Animal Friends | Pause is always last in the play scan, including during reveals. |
| Elouise's Word Search | Pause in the root row scan, after the word bank; Back returns from the later stages. |
| Benny's Dice | Pause among the available turn controls; scanning waits during rolling, initiative and CPU turns. |
| Benny's Mega Slot | Pause in the ordinary play scan; bonus mechanics use their own controls. |
| Benny's Fish Mystery | **Options** at the end of world/scene scans opens pause and settings; live fishing/boat controls remain separate. |

**NARBE Racer retains hold-dependent switch pause during a live race**, including
Press to Step. Its cup/track screens carry the approved notice that players
using brief taps may need help pressing Pause. In two-player play either player
can hold their own switch. The on-screen Pause button also works with a pointer.
Racer is not the only remaining hold-dependent game: Race Tracks, Word Jumble
and Pickleball Rally also have native hold routes without an in-play Pause scan
choice. Preserve these controls; this inventory does not authorize retrofits.

**Trivia Master has switched (2026‑10‑02, at the user's request).** The
hold‑Enter gesture is gone and the header's Pause button is a scan stop. It sits
after the last answer. The choice scan also has its mandatory root blank; the separate question-reading rest remains distinct. Pause is only added to the scan on the game screen, because the
header stays visible on the end and settings screens. If the player pauses in the
moment between picking an answer and the next question loading, the next
question waits for Continue.

**P3GL's pause hold varies by control scheme:** it takes **2 s** with Auto Scan
on and **5 s** with it off (`holdToPause()` in
`apps/games/BENNYSPEGGLE/js/game.js`). These values apply when the before-shot
choice is off. A player who cannot hold can enable **Before Each Shot: Choose
Play or Pause**. Ballista's manual-aim hold is another exception to a five-second
pause assumption; there is no universal duration to promise in player hints.

**Where it is going: pause should become a scannable item everywhere.** Holding
a switch for five seconds is itself a physical demand, and some players cannot
sustain a hold at all — for them the hold gesture is not an accessible route to
pause, it is a locked door. The long‑term intent is for every game to expose
pause as something you can *scan to and select*, with the hold gesture kept as a
convenience rather than the only way in. When you build a new game, favour a
scannable pause entry; do not go retrofitting the existing ones yet.

**But understand what it adds before you reach for it.** Making a control
scannable puts another stop on the scan cycle, and the player meets that stop on
*every single pass*, for the whole session. A game whose only in‑play control is
"fire" lets the player settle in and play. Add a scannable Pause, and every shot
now means waiting through Pause to reach Fire — a player who never opens the
pause menu is still waiting on it, all session.

So the honest trade is: **a hold keeps play quick and direct for the players who
can manage one, and shuts out the players who cannot; a scannable control lets
everyone in, and puts a step between every player and the thing they came to
do.** Neither is simply better.

P3GL is the worked example, and it settles the trade with a setting. It plays
hold‑first — hold Space to aim, release Enter to fire, hold Enter for pause —
which keeps play down to the fewest possible switch presses. **Before Each Shot:
Choose Play or Pause** (in both the main‑menu and pause settings) puts a
choice scan in front of every shot, ordered blank, Pause/Options, Take Shot. The board represents Take Shot and the existing Pause button represents Pause. Aiming begins after Take Shot. A player who cannot sustain a hold turns it on and
is never locked out of leaving; a player who can is never slowed down by it. The
Pause button works either way. When this choice is on, holding Enter does not
pause; use the Pause choice instead.

If you are weighing this for something new: prefer keeping the *primary
gameplay action* off the scan cycle, and put the scannable pause somewhere it
does not sit between the player and the thing they came to do. Or make it a
setting, so a player who needs the scannable route can turn it on and a player
who does not is not slowed down by it.

**Hold-to-charge and timing alternatives are optional, separately scoped future work.**

**Benny's Baseball now implements the alternative.** Its persisted setting is
**Batting: Pick a Swing / Hold to Charge**, reachable from main and pause
settings. Pick a Swing is the default when no preference is stored. The player
first selects Ready to Swing (or a stealable base or Pause) on the field.
The pitch is called aloud, the camera zooms in, and the ball freezes near its
contact location. Only then does the player select Normal, Power, Bunt, Take
Pitch, or Pause.
The ball remains frozen through scanning and pause/resume; selecting a swing
resumes the same pitch. There is no sustained press, release window, or deadline. The game
resolves contact using the swing choice, pitch location and execution quality;
it does not guarantee a hit. Scoring and season eligibility are unchanged.
The original timed charge mode remains available for players who prefer it. Both modes pair the
circular pitch highlight with plain-language text and speech: Favorable pitch,
Neutral pitch, or Difficult pitch. No symbol names or color recognition are
required. Pitch type and location affect swing matchups. The pitching selector
uses stable curved Favorable/Neutral/Risky sections, spoken risk descriptions, and preserves
choices through pause. Explanations play once per game for each swing/risk
category; later scans use short labels. Scores use large white numbers on dark cards with
team-colored borders and stripes. The occasional repeated-hit-batter warning
sequence returns everyone automatically and requires no timed response.

**Benny’s Fish Mystery** retains its hook timing and sustained reel/boat controls. Click-to-fish/click-to-catch or a stepped reel is an internal research idea, not an approved implementation. A later decision may instead retain the mechanic with an accurate hold-required notice.

**Fish Mystery, Bowling and remaining Mini Golf hold paths are internal follow-ups; their existing mechanics are not bugs.** The
timed form stays for players who enjoy it. The rule for providing an alternative
is in section 9, "Timing and holds: preserve play and add options where practical."

**Remappable keys: understood, deliberately not built.** Space and Enter are
widely hard-coded in app handlers (the historical survey counted roughly 190 sites) — so there is no setting a player can change if their hardware sends
something else.

**Why that has not mattered much.** Nearly every switch interface is configurable
on the hardware or driver side: the box is programmed to emit whichever key you
want, so a family whose interface sends the wrong thing usually fixes it there,
once, without the games changing. Remapping in the app would duplicate a knob
most players already have.

**Why it is not nothing.** Some cheap interfaces are fixed{NB}function. Some emit
mouse clicks or gamepad buttons rather than keys. And eye{NB}gaze and head{NB}tracking
users arrive through a different route again.

**The shape it would take, if it is ever built.** Not 190 edits. A translation
layer inside `scan-manager.js` is the only sane route: it already intercepts
every input in the capture phase, so it can swallow an alternative key and
re{NB}dispatch it as Space or Enter, and no game needs to know. Two cautions for
whoever does it:

- A synthetic `KeyboardEvent` has `isTrusted: false` and its `preventDefault()`
  does not suppress the real key's default action — so the *original* event must
  be `preventDefault()`ed as it is swallowed, or Space will scroll the page.
- It is the same class of change as the minimum{NB}hold check in §11: anything that
  intercepts one half of a press and not the other strands games. Deliver
  keydown and keyup as a matched pair or not at all.

Not open work. Recorded so the next person does not begin a repository-wide remapping pass.

The pattern behind all three: **any interaction that requires holding a switch
should have a way through that does not.** Whether that is a menu the player
scans or the game simply supplying the value, as Football's Easy Throw does, is
a per‑mechanic call — §9 sets out how to choose. Holding is an ability, and not
every player has it. For new work, seek a practical optional route and record any remaining hold requirement. For
what is already here, these are internal candidates. Neither alternatives nor hold-game notices are authorized by the scan upgrade. Racer’s separately approved pause-access notice is the exception.

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
