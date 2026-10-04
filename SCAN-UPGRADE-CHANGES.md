# Web scan implementation and Companion 1.0.7

The web upgrade covers all 26 catalogue games, six tools, legacy Mini Golf, Hub menus/Settings and Companion. The owner reports the local changes working well. On October 4, 2026, the owner reported 1.0.7 submitted and awaiting approval, with 1.0.5 still public. Store status has not been independently checked in the publisher dashboard.

This public map replaces the chronological working ledger; its complete original, task notes, backups and test attempts remain preserved locally. Current policy is maintained in [ACCESSIBILITY.md](bennyshub/ACCESSIBILITY.md) and [the developer guide](developer-guide.html). See [validation](submission/VALIDATION.md) and [the test checklist](SCAN-UPGRADE-TESTING.md).

## Current behavior

- Stationary CHOICE menus use the shared scanner. Moving/timed MECHANIC surfaces retain native timing, input ownership and gameplay.
- Roots start blank and include recurring -1 in both directions. Step blank is silent/inert. Auto with Parking Off passes blank silently; only chosen/automatic parking permits Park/Parked narration. Parked Enter resumes the first item without activating it.
- Auto supports chosen parking or 1–3 completed loops, Space brake and owned speech completion plus a full interval. Existing guards, release selection, holds and multiplayer switch ownership remain.
- Scan pause uses only a dotted outline, without visible Paused text or badge. Game/video Pause menus remain. Parked clears highlights and reveals its existing status host.
- Parking/Loops/Brake/Wait settings live only in Hub Settings. Auto-only options remain visible but disabled when unavailable; Loops also needs Auto park. Values/selection persist. Existing local Auto/speed/voice options stay.
- Settings uses normal page scrolling. Input Sensitivity follows Auto; Size follows Background Theme. Selected items stay above the measured footer. Native disclosure/form input has one owner.
- Nested Back restores the parent row/item. Child entry starts at its first item; completing the child loop returns to root blank. Fresh roots and explicit separate modal returns may reset. No minimum press or extra debounce was added.
- Physics, difficulty, art and native holds remain. Racer's approved pre-race pause-access notice is included. Tap-friendly gameplay alternatives and hold-game warnings remain future work.

## Scope and port flags

SHARED identifies relevant behavior for both products; COMPANION identifies the browser extension; WEB-ONLY identifies website-only work. COPY-AS-IS means copy a verified helper unchanged after authorization. RE-PORT means compare/adapt the integration against the real desktop app. ADAPTER means implement the platform contract. WEB-ONLY means no desktop copy. No flag claims completed Electron work.

## Shared and platform file map

All helper filenames below are relative to `bennyshub/shared/` unless a full path is shown.

| Files | Scope | Responsibility | Port |
| --- | --- | --- | --- |
| `platform.js` | SHARED | Browser settings, speech tickets, matched input capture and activity lifecycle. | ADAPTER |
| `scan-manager.js` | SHARED | Central validated preferences and existing sensitivity guard. | COPY-AS-IS |
| `choice-scan.js` | SHARED | Blank loops, parking/brake, owned speech waits, held inputs and nested contexts. | COPY-AS-IS |
| `choice-scan-adapter.js` | SHARED | Explicit app IDs/contexts, redraw/group/Back/pointer mapping; no polling or extra global listeners. | COPY-AS-IS |
| `voice-manager.js` | SHARED | Started/finished/cancel tickets and bounded speech completion. | COPY-AS-IS |
| `scan-status-badge.js`, `scan-status-badge.css` | SHARED | Dotted selected-choice feedback and reserved Parked status. | COPY-AS-IS |
| `scan-settings.js` | SHARED | Portable centralized controls retaining option identity. | COPY-AS-IS |
| `bennyshub/index.html` | SHARED | Hub/Settings ownership, normal page/footer visibility and disclosure boundaries. | RE-PORT |
| `tool-gate.js` | WEB-ONLY | Companion-unavailable dialog suspends tool input and owns its choices. | WEB-ONLY |
| `bennyshub/service-worker.js` | WEB-ONLY | Offline shell with final scan assets under v28. | WEB-ONLY |
| `bennyshub/setup.js`, `bennyshub/extension-setup.html`, `bennyshub/companion-privacy.html` | WEB-ONLY | Setup/return flow, package link and storage/access disclosures. | WEB-ONLY |

## Companion file map

Files below are relative to `extension/`; every row has scope COMPANION and port WEB-ONLY.

| Files | Responsibility |
| --- | --- |
| `player-platform.js` | Validated Hub-settings facade and extension platform adapter. |
| `player-content.js` | Shared scanning, existing guard, compact control row, Help and independent toolbar speech. |
| `player-view.js`, `player-adapters.js` | Reserved video/caption frame, constrained provider layouts, fullscreen recovery and cleanup. |
| `background.mjs` | Validated managed-player transport, live settings and serialized speech preference persistence. |
| `player-registration.mjs`, `policy.mjs` | Granted-host registration, dependency order, validated preferences and production origins. |
| `options.html`, `options.css`, `options.mjs` | Single Streaming and news switch, ten static platform names and separate Calendar. |
| `manifest.json` | Version 1.0.7 without added permissions. |
| `shared/choice-scan.js`, `shared/voice-manager.js`, `shared/scan-status-badge.js`, `shared/scan-status-badge.css` | Exact copies of canonical helpers. |
| `shared/scan-status-badge-style.js` | Generated CSS text for the player shadow root. |

The normal accepted dock is 60 px high. The ordered buttons scroll at narrow widths and reveal the selected choice; video/captions fit above them. Mute/Unmute controls media audio. Help's Toolbar Speech defaults On, persists locally and synchronizes across managed windows without altering Hub voice or media volume. Explicit Say I need help still speaks when automatic narration is Off. Unlock/Relock, Return to Hub and provider sign-in remain available.

Streaming and news grants/revokes the existing origin set together. Full access says On. Partial access says Incomplete and can be removed immediately; Off then On requests the complete set. Refused/incomplete operations cannot claim full success. Calendar, libraries and unrelated preferences are preserved.

## App map

Folders below are beneath `bennyshub/apps/`; each named file is relative to its app and shares the row's scope/port flag. HTML loads explicit dependencies; JS maps native contexts/input; CSS provides local dotted/status feedback. Compare desktop versions before replaying edits; do not replace whole app folders.

| App folder | Changed files | Stationary surfaces / navigation | Native mechanics and exclusions | Scope / port |
| --- | --- | --- | --- | --- |
| `games/BENNYSAYS` | `index.html`, `scan-access.js` | Main; Settings; Difficulty; Player color choices | Sequence demonstration, tones and timed failure/restart are native. No Enter hold-to-pause gesture exists. | SHARED / RE-PORT |
| `games/BENNYSBALLISTA` | `README.md`, `index.html`, `js/castle-files.js`, `js/ui.js`, `style.css` | Welcome, Settings, help, workshop/reset/custom/campaign/kingdom, post-story, pause, Zoom, stable outcomes and castle import; native importer Tab/typing retained. | Aim, power, fire, world physics/animation, Explore controls and native five-/seven-second pause holds remain. Stable results can wait indefinitely; no world freeze added. | SHARED / RE-PORT |
| `games/BENNYSBASEBALL2` | `index.html`, `js/choice-canvas.js`, `js/scenes.js` | Title/mode, Settings, instructions, season/team color; Pitch type/zone, stationary tactical batting and base targets; Existing frozen-pitch Pick a Swing, pause and results | Timed/held batting, pitch and ball flight, running and fielding remain native. Frozen-pitch swing and base-target acceptance use explicit existing-method UI fixtures. | SHARED / RE-PORT |
| `games/BENNYSBASKETBALLSHOOTER` | `index.html`, `scan-access.js` | Main; Settings; Pause; Pause Settings; Game-over choices | Continuous aimer, held power, release shot, physics and ten-second Enter pause remain native; only stationary menus are choice scopes. | SHARED / RE-PORT |
| `games/BENNYSBATTLEBOATS` | `index.html`, `scan-access.js`, `scripts/battleship.js` | Main; Settings; Fleet setup actions; Placed ships; Ship action modal; Placement rows; Placement cells/root boundary/parent restoration; Attack rows; Attack cells and native opponent turn; Pause while parked; Pause Settings; Private player handoff; Native five-second outcome display, no selectable controls | Enemy defense/shot timing is native and suspends choices. Five-second game-over display has no selectable controls and retains automatic return. Ship rules and fleet placement validation unchanged. | SHARED / RE-PORT |
| `games/BENNYSBOWLING` | `index.html`, `js/bowlchallenge.js` | Main, player setup/options, Settings and pause; Stationary Ball/Pause choice | Position/aim oscillation, held power, rolling physics and scoring remain native; native7.5s automatic game-over transition excluded. | SHARED / RE-PORT |
| `games/BENNYSBUGBLASTER` | `game.js`, `index.html`, `scan-access.js` | Main; Settings; Instructions Back; Store before purchases; Quit confirmation; Store available upgrades; Pause; Pause Settings | Moving enemies, active target selection, automatic stomp cadence, level intro and timed outcomes remain native. Five-second Enter pause preserved. | SHARED / RE-PORT |
| `games/BENNYSCHESSCHECKERS` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Legal board choices; Checkers legal destinations and cancel; Chess legal pieces; Chess legal destinations and cancel; Pause; Pause Settings | Legal move engine, CPU turns, timed game-over display and pause hold remain native; stationary human piece/destination decisions use shared policy. | SHARED / RE-PORT |
| `games/BENNYSCONNECTFOUR` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Legal board choices; Pause; Pause Settings | Drop animation, CPU turn and timed game-over presentation stay native; only available columns are choices. | SHARED / RE-PORT |
| `games/BENNYSDICE` | `index.html`, `js/game.js` | Main; Settings; Free Throw rules; Free Throw dice and throw controls; Pause; Pause Settings; Yarkle player setup; Yarkle rules; Yarkle turn decisions; Fahtzee player setup; Fahtzee rules; Fahtzee turn decisions | Three/Cannon physics, initiative, roll animation and CPU decisions stay native. Fahtzee automatic scoring retained; old manual scorecard state is not a reachable new user decision. | SHARED / RE-PORT |
| `games/BENNYSFISHMYSTERY` | `index.html`, `js/ui.js`, `js/util.js` | Main, Settings, dock, pause, world/map, logs and tackle; nested returns and owned entry speech. | Held steering, aim, cast/reel and fight remain native. Auto Space selection remains with Brake Off; Brake On uses shared braking. No new fishing mechanic. | SHARED / RE-PORT |
| `games/BENNYSFOOTBALL` | `index.html`, `js/choice-canvas.js`, `js/game.js`, `js/scenes.js` | Title/Settings, instructions/season/team color; Stationary offense/defense and other ScanList tactical decisions; Pause, nested Pause Settings and results | Live receiver scanner, moving routes/coverage, charge, kick aim/power, clock and play resolution remain native. Pause exclusively suspends underlying tactical choice input without altering world timing. | SHARED / RE-PORT |
| `games/BENNYSMATCHYMATCH` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Cache confirmation; Editor warning; Load game warning; Two-player mode; Single-player mode; Game setup; Unmatched rows; Card child groups and native mismatch delay; Pause while parked; Pause Settings; Challenge setup | Reveal/countdown/mismatch and timed win/loss sequences remain native; busy card play suspends scanning, menus remain available. Authoring/file picker requires mouse as existing warning states. | SHARED / RE-PORT |
| `games/BENNYSMINIGOLF` | `index.html`, `js/input.js`, `js/menu.js` | Legacy direct-URL main/instructions/mode/player setup; Settings/course/custom warning, creator-entry warning; Pause | Native hold aiming, hold charge, released shot and6s Enter pause preserved; timed intro/outro/game-over/challenge fail and mouse course editor excluded. Existing gameplay portrait Rotate Device gate remains. | WEB-ONLY / WEB-ONLY |
| `games/BENNYSPEGGLE` | `index.html`, `js/ui.js` | Title/modes/campaigns/levels/custom library, how-to/legend; Settings, nested Aim/Display, pause; Editor/load warnings, messages and win/loss results; Pre-shot: blank, Pause/Options, Take Shot | Held/automatic aiming, shot/obstacle/peg physics and existing5s Enter pause remain native. Pre-shot order explicitly requested; no new power/shot mechanics. | SHARED / RE-PORT |
| `games/BENNYSRACETRACKS` | `index.html`, `js/ui.js` | Title/mode/vehicle/level/how-to/Settings; Actual pause and results | Live driving, held steering, race progress, animations and native pause gesture remain unchanged; scanner is limited to explicit overlays. | SHARED / RE-PORT |
| `games/BENNYSSHOWNSOUND` | `index.html`, `js/choice-canvas.js`, `js/scenes.js` | Title/Settings, category carousel; Idle wheel choices, pause/settings and editor warning | Wheel spin/stop, reveal and media playback remain native. Category preview persists while selected; blank clears preview without introducing mechanics. | SHARED / RE-PORT |
| `games/BENNYSSLOTMACHINE` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Spin and bet actions; Autoplay choices; Pause; Pause Settings; Out-of-credits choices | Reel animation, automatic spins and bonus timing remain native; stationary spin/bet/autoplay/Pause/out-of-credits choices converted. Existing Enter-hold behavior preserved; no new hold-to-pause gameplay mechanic. | SHARED / RE-PORT |
| `games/BENNYSTICTACTOE` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Legal board choices; Pause; Pause Settings; Game-over decisions | CPU turn and game rules remain native; human board decisions and Yes/No replay menu converted. | SHARED / RE-PORT |
| `games/BENNYSWORDJUMBLE` | `game.js`, `index.html` | Main; Settings; File selection warning; Cache confirmation; Editor warning; Challenge difficulty; Casual length; Letter pool and sentence; Pause; Pause Settings | Success/input-frozen interval and challenge mechanics remain native. External authoring and native file picker remain mouse/keyboard tools behind scanned warnings. | SHARED / RE-PORT |
| `games/ELOUISESWORDSEARCH` | `game.js`, `index.html` | Main; Settings; Clear saved lists confirmation; Editor warning; How to play; Puzzle setup; Puzzle rows and word-bank/Pause choices; Direction decision; Row/cell restoration and distinct word-readout rest; Native automatic length resolution; Pause; Pause Settings; Puzzle completion | Automatic length traversal/word resolution commits gameplay and remains native. Read Words narration and its own bank rest remain native and distinct from shared -1. Native pointer drag/two-tap selection and five-second Enter back-out preserved; explicit Pause stays in row choices. Editor/file picker excluded behind warnings. | SHARED / RE-PORT |
| `games/NARBEANIMALFRIENDS` | `css/style.css`, `index.html`, `js/audio.js`, `js/input.js`, `js/ui.js` | Map/zone, play-mode and stationary navigation; Barn/Pick/Find animal choices, help/Settings/pause; Name keyboard rows and child keys | Reveal/song/narration busy timing and Three renderer remain native; no Enter-hold pause invented. | SHARED / RE-PORT |
| `games/NARBEKART` | `index.html`, `js/ui.js` | Title, rules/player count, type/speed, cup/track and instructions; Player-owned racer and kart choices, both native switches; Settings, pause, results/standings/trophy | Live racing, native single-button/held steering, lane timing, items, race progress and two-player ownership are unchanged; approved tap-only pause-access notice added to existing pre-race text and speech. | SHARED / RE-PORT |
| `games/NARBEMINIGOLF` | `index.html`, `js/game.js`, `js/ui.js` | Title/mode/players/color/course/how-to; Settings, nested Aim/Rules, pause; Editor/load warnings and round results; Easy Pause Putter/Pause and existing Choose Power list | Held/automatic aimer, native power charge, shot/swing/ball/obstacle physics and pause thresholds remain native. Initial Medium power preview unchanged; selecting power still performs native putt. | SHARED / RE-PORT |
| `games/PICKLEBALLRALLY` | `index.html` | Main/difficulty, Settings and pause; Untimed Casual three-zone decision only while not busy | Timed Slow/Medium/Fast zone/countdown, native timed keys, rally/ball/result animation remain native. Existing5s Enter pause preserved. | SHARED / RE-PORT |
| `games/ROBOTFOOTBALL` | `css/stadium.css`, `index.html`, `js/ui.js` | Main/Settings/help, team/season/match setup; Coin toss, playbook, conversion/kickoff/return and between-burst direction choices; Pause and ready next-play/final lists | Receiver aim/routes, field-goal aim/charge, held steering, movement bursts, ball flight/countdown remain native; independent deep tests exercised those boundaries. | SHARED / RE-PORT |
| `games/TRIVIAMASTER` | `index.html`, `script.js` | Main; Settings; Clear saved games confirmation; Editor warning; Game selection; Load game warning; Categories page; Categories next page; Answer, Pause and question readout; Pause; Pause Settings; End decisions | Question/media playback rest remains a separate native interaction. Answer feedback/delay remains native, with native Pause availability. Editor/file picker excluded behind scanned warnings. | SHARED / RE-PORT |
| `tools/dayhub` | `app.js`, `index.html`, `style.css` | Six daily-action choices; Native setup form suspends scan and preserves typed Space; Companion gate suspends tool input | Native weather/calendar/news functions and setup typing unchanged. | SHARED / RE-PORT |
| `tools/journal` | `app.js`, `calendar-view.js`, `index.html`, `style.css` | Main, options, entries, date navigation, questions, entry view/delete confirmation; Calendar controls/week/footer row hierarchy and month transition; Keyboard and prediction row restore; save/view/delete cancel | Storage, entries, questions and 3 s hold gestures retained; no data migration. | SHARED / RE-PORT |
| `tools/keyboard` | `app.js`, `index.html`, `style.css` | Text, prediction, control and letter/number rows with child choices; Same-row restore, prediction identity, child-loop root blank; Settings redraw retains changed option | Text insertion, learned predictions and existing 2 s hold gestures retained. | SHARED / RE-PORT |
| `tools/phraseboard` | `board-choice.js`, `board-enhancements.css`, `board-live.js`, `index.html` | Main/board/category grid rows or cells, free named groups, sentence controls and predictions; Settings and structural Row/Cell rebuild restore exact changed option; Create/load warnings and embedded media controls; native editors excluded; Existing spoken-group and TTS-on-scan preferences retained independently | Native board editor and media playback unchanged. Auto Space selects when Brake Off; Brake On pauses. Native 3 s holds retained. | SHARED / RE-PORT |
| `tools/streaming` | `app.js`, `index.html`, `keyboard_integration.js`, `style.css` | Main, settings, editor warning, genres/pages, title actions, seasons and episodes/pages; Pause, pause-to-settings return and explicit header Back; Search keyboard/text/predictions; launch/gate suspension; quiet-refresh identity mapping | Library/editor/Companion playback preserved; native 3 s reverse and 5 s pause gestures retained. | SHARED / RE-PORT |
| `tools/ytsearch` | `index.html`, `js/app.js`, `js/scanning.js`, `js/startup.js`, `styles.css` | Keyboard/history/prediction rows and child choices; Settings and active YouTube feed controls; Startup script-failure recovery choice | Native search, history and typing retained; 2.5 s reverse threshold/2 s repeat and 3 s Back retained. Dormant image/video branches without page DOM are not claimed as active features. | WEB-ONLY / WEB-ONLY |

Native mouse/keyboard editors remain unchanged; scanned entry/load/warning dialogs are covered. The `NARBEKART/tools/ui_mock.html` development mock is WEB-ONLY and excluded from the public build. Mini Golf's existing Choose Power still performs its native putt; no separate power-and-Putt confirmation was added. Fish hold mechanics remain without a tap-to-fish replacement or extra hold-game warning.

## Build, tests and documentation

| Files | Scope / port | Purpose |
| --- | --- | --- |
| `scripts/sync-companion-shared.cjs` | WEB-ONLY | Copy/check four canonical assets and generated CSS text. |
| `scripts/package-companion.cjs`, `scripts/package-release.py` | WEB-ONLY | Production allowlist/sanitization; Node is the active immutable extension packager. |
| `scripts/build.cjs` | WEB-ONLY | Build public roots and include only the setup-linked production ZIP. |
| `scripts/check-*.cjs`, `scripts/browser-check.cjs`, `scripts/player-layout-checks.cjs`, `scripts/release-assets.cjs` | WEB-ONLY | Retained browser/input/layout/release checks; [prerequisites](scripts/README.md). |
| `tests/*.test.cjs`, `tests/fixtures/scan-upgrade.html` | WEB-ONLY | Controller/adapter/speech/badge/app-boundary/package regression fixtures. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Current behavior contract. |
| `developer-guide.html` | SHARED / RE-PORT | Integration and native-mechanic guidance. |
| `README.md`, `CHANGELOG.md`, `AGENTS.md`, `SCAN-UPGRADE-TESTING.md`, `WEB-EXTENSION-MIGRATION.md`, `extension/README.md`, `submission/*.md` | WEB-ONLY | Release, privacy, validation and maintenance handoff. |

## Release and validation

Companion 1.0.7 is **101,050 bytes / 26 members**, SHA-256 `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`. Only its manifest version differs from accepted 1.0.6-blanket-access. Independent ZIP/CRC/unpacked checks, production scoping, shared parity and website-download parity passed. All 24 prior archive copies were unchanged.

The runtime baseline passed 142 unit tests; grouped-access settings passed 16 Edge UI groups. Version promotion passed three targeted existing package/shared-sync tests. All catalogue apps have recorded stationary-choice acceptance; focused later suites cover dotted feedback, the inline toolbar, independent speech and silent Parking Off. These overlapping fixtures are not exhaustive playthroughs. [Validation](submission/VALIDATION.md) records coverage and manual limits.

Local-only evidence roots: `artifacts/scan-web-complete/`, `artifacts/scan-outline-only/`, `artifacts/quiet-loop-final/`, `artifacts/companion-master-access/`, `artifacts/companion-1.0.7/`. Evidence, profiles and old ZIPs stay outside public source/build. Full source/document snapshots remain in the owner's external Website Backups directory.

## Publication cleanup

The pre-publication snapshot preserves the full previous ledger and source. Raw task notes and the one-time historical archive audit remain local. Public instructions use maintained accessibility/developer guidance; local evidence is listed without broken public hyperlinks. Release-owner cleanup removes retired prediction experiments, retains active prediction behavior, preserves submitted package bytes with scoped Git attributes, pins build tooling and checks the tracked Companion checksum.

### Final pre-push verification

The staged source was exported with Linux-style line endings, without local runtime/build/release files. All **142 unit tests** pass; the public build/audit and all **905 references** pass. The build has **1,179 files / 354,390,252 bytes**. Its Companion ZIP exactly matches the submitted SHA-256 in `submission/COMPANION-SHA256SUMS.txt`. These byte counts describe the clean Git export; previous local worktree reports may differ in web text line endings.

The complete pre-publication source snapshot contains **1,550 files**, with hashes verified before removal. **16 retired files / 17,575,492 bytes** were archived and removed. Earlier release archives remain unchanged and excluded from Git. Local pre-push evidence is stored under `artifacts/prepublish-1.0.7/`; it is not published. GitHub deployment and live checks follow the push and are not implied by this pre-push record.

| File | Scope | Cleanup | Electron port |
| --- | --- | --- | --- |
| `.gitattributes` | WEB-ONLY | Preserve byte-exact Companion inputs and their canonical shared copies across Git checkouts. | WEB-ONLY |
| `.gitignore` | WEB-ONLY | Keep raw task instructions and the historical workstation-only preservation audit local. | WEB-ONLY |
| `.github/workflows/pages.yml` | WEB-ONLY | Pin Node 22.16.0 and require the submitted Companion checksum before publishing. | WEB-ONLY |
| `submission/COMPANION-SHA256SUMS.txt` | WEB-ONLY | Record the exact submitted 1.0.7 ZIP expected in the public build. | WEB-ONLY |
| `LICENSE` | WEB-ONLY | Retain the same license text with its original CRLF bytes for reproducible packaging. | WEB-ONLY |
| `AGENTS.md` | WEB-ONLY | Use maintained accessibility/developer guidance instead of the local raw prompt. | WEB-ONLY |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Replace historical working notes with the current implementation map and preserve the locked Electron plan. | WEB-ONLY |
| `submission/VALIDATION.md` | WEB-ONLY | Summarize verified coverage and identify local-only evidence and live-check limits. | WEB-ONLY |
| `submission/START-HERE.md` | WEB-ONLY | Use current release instructions and owner-reported store submission status. | WEB-ONLY |
| `submission/STORE-LISTING.md` | WEB-ONLY | Record owner-reported 1.0.7 submission and public 1.0.5 status. | WEB-ONLY |
| `submission/REVIEWER-INSTRUCTIONS.md` | WEB-ONLY | Record owner-reported store status without claiming dashboard verification. | WEB-ONLY |
| `scripts/README.md` | WEB-ONLY | Document portable checks and optional browser-test prerequisites. | WEB-ONLY |
| `scripts/check-scan-tools-phraseboard.cjs` | WEB-ONLY | Remove a trailing-whitespace-only line from the browser test; behavior is unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm-client.js` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm-worker.js` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/COPYING-LGPL-2.1.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/DOUBLE-CONVERSION-LICENSE.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/EMSCRIPTEN-LICENSE.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/KENLM-LICENSE.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/README.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/candidates.json.gz` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/english.arpa.gz` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/kenlm.js` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/kenlm.wasm` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/model-info.json` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/rebuild-source.tar.gz` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `scripts/build-kenlm.py` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `scripts/kenlm-browser.cc` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `scripts/package-keyboard-model.py` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |


## Scan Speed correction — 2026-10-04

Scan Speed stays enabled in both Step and Auto modes, since it also sets the interval for held backward scanning. Auto Scan, Input Sensitivity and Scan Speed share the first row; only Parking, Loops, Brake and Wait depend on Auto. Existing values and stable selection are retained. The correction passes 142 unit tests, 18 Settings browser groups, responsive/footer checks at three sizes, public build/audit and 905 links. Companion 1.0.7 bytes are unchanged.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/shared/scan-settings.js` | SHARED / COPY-AS-IS | Move Scan Speed beside Auto and sensitivity; keep it enabled in both modes. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Document the always-enabled speed control and shared row. |
| `scripts/check-hub-scan-settings.cjs`, `scripts/check-hub-scan-visibility.cjs` | WEB-ONLY | Check same-row layout, enabled speed, preserved choice and actual backward-scan interval. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record this correction for the Electron port. |

## Scan Speed range — 2026-10-04

The website offers exactly **1, 2, 3, 4 or 5 seconds**, with **2 seconds** still the default. The fifth value persists and wraps back to one second. Scan Speed remains enabled with Auto Off for held backward scanning. Phraseboard’s local Speed choice now reads the shared range rather than a separate four-value list. The Electron follow-up uses the same range.

Companion **1.0.7 needs no update** for this change: the Hub already transmits milliseconds, and the submitted extension accepts `scanInterval: 5000` through launch, live sync and polling. Its existing player honors that full interval. The extension’s transport safety clamp remains 1–10 seconds for compatibility; the Hub’s selectable range is 1–5. No extension source, version or ZIP was changed; submitted SHA-256 remains `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`.

Validation: **55 focused unit tests** and **4 real Edge groups** passed, covering range/default/persistence, full five-second timing and brake resume, Companion transport/player timing, Hub Step reverse timing and Phraseboard cycling/identity. The six relevant packaged transport/player sources match their current production-sanitized sources. Local evidence: `artifacts/scan-speed-five/`; pre-edit copies are retained in Website Backups.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/shared/scan-manager.js` | SHARED / RE-PORT | Add the fifth speed without changing the default or prior indexes; desktop also migrates legacy six-second saves. |
| `bennyshub/apps/tools/phraseboard/index.html` | ADAPTER / RE-PORT | Derive local cycling and synchronization from the manager’s range; retain five-second fallback. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Update the selectable speed contract and default. |
| `developer-guide.html` | SHARED / RE-PORT | Update the selectable speed guidance and default. |
| `tests/scan-upgrade.test.cjs`, `tests/companion-scan-sync.test.cjs`, `tests/companion-player-scan.test.cjs` | WEB-ONLY | Cover the fifth speed, boundaries, persistence, timer and existing extension compatibility. |
| `scripts/check-scan-speed-five.cjs`, `scripts/check-companion-scan.cjs` | WEB-ONLY | Focused Hub/Phraseboard browser acceptance and five-value test mapping. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record this range correction and unchanged submitted Companion. |

## Ballista Settings navigation and cache refresh — 2026-10-04

Ballista’s Back choice was last in a fixed-height Settings grid and could be clipped completely in a short window. Back is now the first choice. The existing Settings list scrolls vertically when needed; no second scroll container is added. Fresh Settings entry starts at the top, while a value change preserves the selected item and reveals it. Back returns to the main menu or the in-game pause menu according to where Settings was opened.

Matching web and Electron files passed **21 focused browser groups each**, including 1280×720, 390×844 and 480×360 layouts, all 15 choices, silent blank traversal, Auto, parking, dotted brake, redraw/resize identity and both exit routes. Evidence: `artifacts/ballista-settings-back/`. Browser fixtures use isolated storage and desktop source without launching native services.

Website cache advances to v29. Offline acceptance verifies the new scan-manager bytes and the five-second setting with Auto Off. Final website validation passed 145 unit tests, 905 links, the public build and release audit. Submitted Companion 1.0.7 remains unchanged.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/apps/games/BENNYSBALLISTA/js/ui.js` | ADAPTER / DONE ON ELECTRON | Put Back first; reset fresh Settings scroll without resetting in-place selection. |
| `bennyshub/apps/games/BENNYSBALLISTA/style.css` | ADAPTER / DONE ON ELECTRON | Make overflow reachable inside the existing Settings list and retain highlight space. |
| `scripts/check-ballista-settings-back.cjs` | WEB-ONLY | Reproduce both return routes and clipping at three window sizes; accepts a desktop source root. |
| `bennyshub/service-worker.js` | WEB-ONLY | Refresh cached app assets with v29. |
| `scripts/check-scan-offline.cjs` | WEB-ONLY | Verify cache v29, exact manager bytes and enabled five-second Step setting offline. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record this fix and its completed desktop application. |

## ELECTRON PORT PLAN — LOCKED

No desktop files were changed. This plan may start only after the user tests/confirms the web changes and explicitly says **"start the Electron pass."**

Desktop root: the separate Electron source location supplied privately by the owner, outside this repository.

### COPY-AS-IS destinations after authorization

These policy/helper files go to the same relative destination beneath that desktop root, unchanged after verification:

| Web source | Electron destination relative to desktop root |
| --- | --- |
| `bennyshub/shared/scan-manager.js` | `bennyshub/shared/scan-manager.js` |
| `bennyshub/shared/voice-manager.js` | `bennyshub/shared/voice-manager.js` |
| `bennyshub/shared/choice-scan.js` | `bennyshub/shared/choice-scan.js` |
| `bennyshub/shared/choice-scan-adapter.js` | `bennyshub/shared/choice-scan-adapter.js` |
| `bennyshub/shared/scan-status-badge.js` | `bennyshub/shared/scan-status-badge.js` |
| `bennyshub/shared/scan-status-badge.css` | `bennyshub/shared/scan-status-badge.css` |
| `bennyshub/shared/scan-settings.js` | `bennyshub/shared/scan-settings.js` |
| `bennyshub/ACCESSIBILITY.md` | `bennyshub/ACCESSIBILITY.md` |

App integrations marked RE-PORT keep their same relative folders from the app mapping above. Compare desktop versions first; do not overwrite whole app folders, catalogs, data, Electron bridges or native launch behavior. New standalone choice bridges may be copied only after confirming their app APIs match. Web-only YouTube Search, Companion transport, setup/download pages, tool gate and service worker do not belong in that copy.

### Desktop platform adapter

Implement the same contract at `bennyshub/shared/platform.js`:

- **Settings:** `settings.open({key,normalize,project,onChange})` returns `readCached()`, `save(value)`, `reload()`. Desktop scan settings currently use localStorage; voice settings also use `electronAPI.voice` IPC and cache. Supply synchronous cached defaults, settle later native loads, preserve existing keys/unknown fields, and propagate live changes without echoes.
- **Speech:** voices and voice-change subscription; `speak(text,options)` returns `{started,finished,cancel}`; `cancel()` settles the owned request. Map actual native start/end/error/cancel events through existing voice IPC. Shared voice policy owns the cap. Missing engine events must never strand scanning or let a stale utterance advance another context.
- **Input:** `input.capture(handler)` supplies original matched Space/Enter/NumpadEnter press/release events before app handlers exactly once. Preserve player-owned multiplayer switches and native holds. Do not reintroduce desktop's old minimum-press filter or double-register browser plus native events.
- **Lifecycle:** `lifecycle.onActivity(callback)` with cleanup, mapping focus/visibility/native activation. Clear half-held inputs and restart a full interval on resumption.

### Python streaming control bar

Re-port behavior in `bennyshub/apps/tools/streaming/utils/control_bar.py`: recurring blank stop, silent Step deadzone, Auto chosen/loop parking, visible Parked status, Enter resume without activation, and Space brake tap/hold/full-interval resume. Read the Hub's saved scan mode, interval, sensitivity and new parking/brake fields through its existing settings transport. This Python scope is **park and brake only**; do not invent speech-wait support or replace media/navigation controls. Preserve its native hold thresholds. Messenger's separate Python bar and backend are not this control bar.

### Desktop acceptance before any sync claim

Back up the complete working desktop first. Test speech end/failure/timeout/cancellation, recorded-label completion, IPC/cache startup races, storage persistence, live settings, duplicate key capture, valid short releases, native long holds, focus loss, app/iframe ownership, multiplayer keys, all nested returns and visible status at the actual desktop window sizes. Re-run the per-app web checklists with the real desktop engines. Audit COPY-AS-IS hashes and mark every ledger entry DONE ON ELECTRON or NOT NEEDED only after verification.

Desktop-only Pet Pals, Sphere Splash, Web Search, Messenger and RT Convo remain unverified and require their own scope and checklists. Do not label them web-tested.
