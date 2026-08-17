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
   platforming, QTEs, health decay, countdowns, or hold-to-aim precision. If a mechanic
   requires fast reaction time, it does not belong in this repo.
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

| Input | Action |
|---|---|
| Spacebar, short press (on release) | Move highlight forward in the current scan list |
| Spacebar, held 3+ seconds | Auto-scan forward until release |
| Return, short press (on release) | Select the highlighted item |
| Return, held 1.5+ seconds | Open context/pause menu, or back out of a sub-mode |
| Mouse/touch (optional) | Click = select. Never require dragging. |

- Scanning starts only after the *first* Spacebar press in a scene/game — don't auto-highlight on load.
- Row-then-item scanning pattern for grids: Spacebar cycles rows, Return enters a row; inside the row, Spacebar cycles items, Return selects.
- Insert a "deadzone" scan step (nothing highlighted) right before a list wraps back to the top.
- Loop order is always top-to-bottom, left-to-right, and never changes mid-session.
- When returning from a submenu, restore the highlight to whatever was last focused.
- There is a global ~250ms input-cooldown after every Space/Return release (see `scan-manager.js`) to stop a single physical switch press from double-firing. Don't fight this or add your own competing debounce.

## Mechanics that fit this project

Good: matching/memory, Simon-style sequencing (no timing), sorting, grid navigation with
keys/obstacles, jigsaw/tile placement, spot-the-difference, non-timed mazes, yes/no logic
puzzles, inventory-gated story choices, stepwise picture fills, word building with
predictive suggestions, one-step-at-a-time math/shapes, turn-based board/sports/strategy
games.

Not allowed: timers, falling objects, platforming, reaction tests, QTEs, hold-to-aim
precision, multi-axis analog control, anything with a fail state triggered by being too slow.

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
- [ ] Deadzone step before a scan list wraps?
- [ ] Fonts readable at 100% on tablet, adjustable up to 200%?
- [ ] TTS reads focus, selection, errors, and outcomes — and never blocks input?
- [ ] Return-hold opens Pause/Context from every screen?
- [ ] No timers or reflex-based steps anywhere?
- [ ] Auto-save and resume work correctly?
- [ ] New game/tool registered in `games.json`/`tools.json` with a thumbnail?
