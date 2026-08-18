# AGENTS.md — NARBE House / Benny's Hub

Instructions for AI coding assistants (Claude Code, ChatGPT, Copilot, etc.) working in this repo.

## What this project is

This site hosts **Benny's Accessibility Hub** — free games and tools built for Ben, who has
TUBB4A-related Leukodystrophy (H-ABC) and can only reliably use **one or two switches**
(mapped to Spacebar and Return/Enter). Everything here must work for someone with severe
motor impairment and no reliable fine motor control or reaction speed. The human-facing
version of these rules lives in [`developer-guide.html`](developer-guide.html) — this file
is the same rules, distilled for an AI assistant to load automatically.

If you are building or editing a game or app in this repo, these rules are not optional
style suggestions — they are accessibility requirements for a real person.

## Hard rules

1. **Every game/app must be 100% playable with only two keys: Spacebar and Return.**
   Mouse/touch may be offered as an *optional* extra for caregivers, but nothing may
   *require* a mouse, touch, drag, or any key other than Space/Return.
2. **No timers, no reflex mechanics, no sudden fail states.** No falling objects,
   platforming, QTEs, health decay, or countdowns. If a mechanic requires fast reaction
   time, it does not belong in this repo. **Hold-to-charge and hold-to-sweep aiming are
   allowed**, but only under the rules in
   [Hold-to-charge and hold-to-sweep](#hold-to-charge-and-hold-to-sweep-aim-and-power) —
   those rules are what keep a charge meter from turning into a reflex test.
3. **Everything is scannable.** Any list of choices (menu, inventory, board squares, grid)
   must be navigable by cycling through it with Spacebar and confirming with Return —
   never by requiring the player to jump straight to an item.
4. **`autoScan` defaults to `false`.** Scanning only starts after the first Spacebar press
   in a scene; auto-scan is an opt-in setting, not the default. (This is what
   `bennyshub/shared/scan-manager.js`'s `DEFAULT_SETTINGS.autoScan: false` comment
   "per agents.md" refers to — this file.)
5. **TTS (text-to-speech) on focus and on selection for every interactive element.** TTS
   must never block input — the player can always move on before speech finishes.
6. **Always provide Undo/Back**, reachable via a Return long-press (context/pause menu).

## Input model (exact behavior)

**In a scan list (menus, grids, any list of choices) — the default everywhere:**

| Input | Action |
|---|---|
| Spacebar, short press (on release) | Move highlight forward in the current scan list |
| Spacebar, held 3+ seconds | Scan **backward** through the list, repeating until release |
| Return, short press (on release) | Select the highlighted item |
| Return, held 1.5+ seconds | Open context/pause menu, or back out of a sub-mode |
| Mouse/touch (optional) | Click = select. Never require dragging. |

**During an aim/charge step (only in games that have one — see the next section):**

| Input | Action |
|---|---|
| Spacebar, press and hold | Sweep the aim continuously; each new press reverses direction |
| Spacebar, release | Stop the sweep and lock the current angle |
| Return, press and hold | Charge power — the meter fills and then **stops at max** |
| Return, release | Commit the shot at whatever power the meter reached |
| Return, held past the pause threshold | Open pause/context menu *instead of* shooting (see below) |
| Mouse/touch (optional) | Press and hold to charge, release to shoot. Never require dragging. |

- Scanning starts only after the *first* Spacebar press in a scene/game — don't auto-highlight on load.
- Row-then-item scanning pattern for grids: Spacebar cycles rows, Return enters a row; inside the row, Spacebar cycles items, Return selects.
- **Spacebar-hold scans backward, not forward.** Every game in the hub does it this way: a 3-second hold steps back one item immediately, then keeps stepping back at the scan interval (`NarbeScanManager.getScanInterval()`) until release; the release itself must *not* also fire a forward step. This is how a player who overshoots gets back without cycling all the way around. Speak "Backwards scanning" when it starts — about half the games already do, and it's the behavior to copy.
- Insert a "deadzone" scan step (nothing highlighted) right before a list wraps back to the top.
- Loop order is always top-to-bottom, left-to-right, and never changes mid-session.
- When returning from a submenu, restore the highlight to whatever was last focused.
- There is a global ~250ms input-cooldown after every Space/Return release (see `scan-manager.js`) to stop a single physical switch press from double-firing. Don't fight this or add your own competing debounce.

## Hold-to-charge and hold-to-sweep (aim and power)

Some games genuinely need a *direction* and a *strength*, and asking for those through a
scan list produces something unplayable. For those, a game may use **press-and-hold then
release** on Spacebar (sweep the aim) and Return (charge the power).
[`BENNYSMINIGOLF`](bennyshub/apps/games/BENNYSMINIGOLF/js/game.js) and
[`BENNYSPEGGLE`](bennyshub/apps/games/BENNYSPEGGLE/index.html) are the two reference
implementations — match their behavior rather than inventing a third dialect.

This is an exception with conditions attached. A hold-and-release control is allowed only
when **all** of these hold:

1. **No deadline, ever.** The player may hold as long as they like, and may sit idle
   between shots as long as they like. Nothing in the scene moves, decays, or fails while
   they are aiming or charging.
2. **The meter clamps at max — it never wraps, bounces, or overshoots.** Holding "too
   long" gives maximum power and nothing worse. There is no sweet spot to miss and no
   penalty for a slow release; that is precisely what keeps this out of QTE territory.
   Golf ramps power 0 → 3 over five seconds and then pins it there (`this.power > 3`).
3. **Aim sweeps continuously and reverses direction on each new press**, so a player who
   overshoots simply releases, presses again, and comes back the other way. Better still,
   turn the sweep round at its own travel limits so it never stops or wraps under a
   continuous hold — `BENNYSBALLISTA` runs 20° up to 70°, reverses, and comes back down
   for as long as the switch is held, which means overshooting costs only the wait for it
   to come past again. Never require a precise release instant to hit a specific angle —
   targets must be forgiving enough to hit at sweep speed.
4. **Sweep speed is a user setting, and slow is a real option.** Golf offers Super Slow /
   Slow / Medium / Fast (60/30/20/10 seconds per full revolution) via its `aimerSpeed`
   setting. Default to a speed Ben can actually stop on, not a demo-friendly one.
5. **Feedback while charging is continuous and multi-channel** — a visible meter *and*
   non-speech audio. Golf draws a green→yellow→red power bar and beeps at each 20% step
   (`audio.js`, `updateChargeSound`). Don't use TTS for this; speech is too slow and would
   lag behind the meter.
6. **A weak or missed shot is never a fail state.** Releasing at 5% power is a legal (bad)
   shot: the turn plays out, the score updates, the player goes again. No lives lost, no
   "too slow", no reset.
7. **Letting go early must be harmless.** An accidental release costs a weak shot the
   player can recover from, never a run. **Prefer going further: make release only
   *stop* the meter, and take a separate press to commit.** `BENNYSBALLISTA` does this —
   Space release stops the charge, Return fires — so a switch slipping out of a hand
   costs nothing at all, and a player can stop, listen to where the shot lands, and hold
   again to add more. Release-fires (golf, bowling) stays allowed, but a game being
   written from scratch should use the two-press form.

**The pause-menu conflict.** Return-hold normally opens the pause menu at 1.5s, but in
these games Return-hold *is* the charge. Resolve it by pushing the pause threshold out
past a realistic full charge, and treat a hold that long as "menu, not shot" — the shot
must not fire when the menu opens. Golf uses 6s; Peggle uses 5s, dropping to 2s when
auto-scan is on, since a single-switch player never holds Return to charge. Pick yours the
same way — full charge time plus comfortable headroom — and state the number in the game's
help text.

**The backward-scan conflict.** Spacebar-hold normally scans backward, but during an
aim step Space-hold *is* the sweep. Scope it by mode, the way the references do: golf only
arms its backward-scan timer when `mode === 'MENU'`, Peggle only inside its menu branch,
`BENNYSRACETRACKS` only when `ctx() === 'menu'`. Backward scan stays intact everywhere the
player is picking from a list; the sweep only takes over Space while actually aiming.

**Auto-scan interaction.** With `autoScan` on, the aim sweeps by itself and the player only
presses Return. The game must stop the sweep the moment charging starts and restart it on
the next turn (golf does this with `autoScan && !this.charging`). A single-switch player
must be able to complete a whole shot with Return alone.

**Where the references differ:** Peggle uses hold-to-sweep for aim but fires at fixed
power on a short Return press — no charge meter at all. If a game works at fixed power,
prefer that; it's one less thing to hold. Add the charge meter only when strength is
genuinely part of the puzzle, as it is in golf and `BENNYSBALLISTA`.

Ballista is also the one that keeps Space and Return cleanly split: **Space holds both
meters, Return commits them**, so Return-hold is still the ordinary 3-second back/pause
and there is no threshold to push out at all. That is the easier arrangement to get right
— reach for golf's Return-charge only if Space is already doing something else during the
shot. In either arrangement each meter takes two Return presses, the first stopping a
moving meter and the second committing it, which is also what makes auto-scan work: both
meters run themselves and Return alone plays the whole game.

## Mechanics that fit this project

Good: matching/memory, Simon-style sequencing (no timing), sorting, grid navigation with
keys/obstacles, jigsaw/tile placement, spot-the-difference, non-timed mazes, yes/no logic
puzzles, inventory-gated story choices, stepwise picture fills, word building with
predictive suggestions, one-step-at-a-time math/shapes, turn-based board/sports/strategy
games, and untimed aim-and-shoot games built on the hold-to-sweep / hold-to-charge pattern
above (`BENNYSMINIGOLF`, `BENNYSPEGGLE`, `BENNYSBOWLING`, `BENNYSBALLISTA`).

Not allowed: timers, falling objects, platforming, reaction tests, QTEs, multi-axis analog
control, anything with a fail state triggered by being too slow. A charge meter that
punishes over-holding — one that wraps back to zero, bounces, or requires releasing inside
a sweet-spot window — is a reaction test wearing a power bar, and is not allowed; see the
clamping rule above.

## Visual & audio requirements

- High-contrast UI by default, large hit targets (≥64px on tablet), generous spacing.
- Global font scaling: 100/125/150/175/200% presets.
- Color profiles: High Contrast, Light, Dark, and "Ben Default" (brand colors).
- Speak the item name on focus, speak a confirmation on selection, speak a short helpful
  line on error/locked action (e.g. "Need the key for this door").
- Consistent header (Title, Help, Settings, Exit to Main Menu) and footer (current mode,
  current scan target, legend: `Space = next`, `Return = select`, `Return hold = menu`).
- Auto-save progress on every state-changing selection; resume restores the exact frame
  and highlight.

## Shared modules — reuse these, don't reinvent them

`bennyshub/shared/` has hub-wide helpers that games are expected to load and use instead of
rolling their own version:

- **`scan-manager.js`** → `window.NarbeScanManager` — single source of truth for
  `autoScan` and scan speed (`getSettings()`, `setAutoScan()`, `cycleScanSpeed()`,
  `subscribe(callback)`). Also installs the global 250ms input-cooldown guard on
  Space/Return/click/touch — just load the script, you don't need to call anything for
  the cooldown to apply.
- **`voice-manager.js`** → `window.NarbeVoiceManager` — persisted TTS settings
  (enabled, voice, rate, pitch, volume) shared across all apps via `localStorage`.
- **`safe-audio.js`** → `window.SafeAudio` — HTML5-`<audio>`-based sound effects.
  Deliberately avoids the Web Audio API/`AudioContext`, which can crash the renderer in
  the Electron desktop build. Use `SafeAudio.preload(name, url?)` /
  `SafeAudio.play(name, volume?)` for any game sound; only reach for something else if a
  game truly needs Web Audio features SafeAudio can't provide.
- **`ios-audio-fix.js`** — unlocks `AudioContext`/`SpeechSynthesis` on first touch on iOS.
  Include it on any page that plays audio or speech, no API calls needed.
- **`tutorial-modal.js`** → `window.BennyTutorial` — the "how to play" video modal shown
  from a game's Help button.

## Repo structure conventions

- Each game lives in its own folder under `bennyshub/apps/games/<GAMENAME>/index.html`
  (all-caps folder name), each tool under `bennyshub/apps/tools/<toolname>/index.html`.
- New games/tools must be registered in
  [`bennyshub/apps/games/games.json`](bennyshub/apps/games/games.json) or
  [`bennyshub/apps/tools/tools.json`](bennyshub/apps/tools/tools.json) (id, title,
  description, path, image, genres) — the hub reads these files to build its menu, it
  does not scan the filesystem.
- Add a matching thumbnail under `bennyshub/images/games/` or `bennyshub/images/tools/`.
- A game that needs a local server to run correctly (e.g. `fetch`-ing local JSON) should
  set `"needsServer": true` in its `games.json` entry, as `TRIVIAMASTER` does.
- Prefer a single self-contained `index.html` per game (HTML/CSS/JS together) unless the
  game is genuinely large enough to need split files — this matches how the rest of the
  hub is built and keeps it easy for non-developer volunteers to read.
- This is a default, not a ban on dependencies. When a game's actual mechanics need
  something a hand-rolled solution can't reasonably provide — real rigid-body physics,
  3D rendering — pull in a real library rather than hand-rolling a worse version of it.
  `BENNYSBOWLING` vendors `three.js` + Ammo.js (WASM) for its physics/rendering, and
  `BENNYSBALLISTA` vendors Box2D (WASM) for its castle physics; both are the sanctioned
  pattern, not exceptions to apologize for. When you do this: vendor the library under the
  game's own `js/` folder (don't pull from a CDN — the hub has to work offline), keep the
  license file next to it, note the dependency in the game's `README.md`, and set
  `"needsServer": true` in `games.json` if it needs `fetch` (e.g. loading a `.wasm`
  binary) rather than working from a bare `file://` page.
- Every game folder should have its own `README.md` describing what it is and how to
  play it. (Several existing games are missing this — see note below.)

## Known gaps to be aware of

- Most game folders under `bennyshub/apps/games/` have no `README.md` at all.
- `BENNYSBOWLING/README.md` is leftover boilerplate from the upstream `ammo.js`/three.js
  bowling demo it was forked from — it describes drag/flick touch controls and links to
  someone else's GitHub Pages, not this game's actual two-button controls. Don't treat it
  as accurate; if you touch that game, rewrite its README to match the rules above.

## QA checklist before shipping any game/app change

- [ ] Every action possible with only Spacebar and Return?
- [ ] Same actions also possible with mouse/touch where offered, without requiring drag?
- [ ] Scanning begins only after the first Spacebar press?
- [ ] Spacebar short/hold and Return short/hold all behave as specified above?
- [ ] If the game sweeps or charges on hold: meter clamps at max with no wrap or sweet
      spot, no deadline to release, sweep reverses on each press, speed is adjustable?
- [ ] If the game charges on Return-hold: pause threshold pushed past a full charge, and
      holding to the menu does *not* also fire the shot?
- [ ] Charge state shows both a visible meter and non-speech audio feedback?
- [ ] Spacebar-hold scans *backward* through the list (not forward), and releasing
      after a hold doesn't also step forward?
- [ ] Deadzone step before a scan list wraps?
- [ ] Fonts readable at 100% on tablet, adjustable up to 200%?
- [ ] TTS reads focus, selection, errors, and outcomes — and never blocks input?
- [ ] Return-hold opens Pause/Context from every screen?
- [ ] No timers or reflex-based steps anywhere?
- [ ] Auto-save and resume work correctly?
- [ ] New game/tool registered in `games.json`/`tools.json` with a thumbnail?
