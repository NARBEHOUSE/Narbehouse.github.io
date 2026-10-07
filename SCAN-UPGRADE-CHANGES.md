# Web scan implementation and Companion 1.0.8

## Robot Pickleball catalog and web release — 2026-10-07

The owner approved the repaired game and requested a fresh screenshot, updated descriptions in the PC Hub, web Hub and NARBEHOUSE homepage, and publication of all pending web updates. This release promotes the existing repaired Robot Pickleball build into the web catalog without changing its gameplay. The pickleballrally ID and favorites remain intact, and Lily Flack’s original stays accessible from credits. The new 1920×1080 screenshot was captured from the matching local web game in normal Chrome.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/games.json | WEB + DESKTOP / CATALOG UPDATED | Robot Pickleball title, launch path, current controls/pace description and versioned screenshot. |
| bennyshub/images/games/narbe-pickleball-2026-10.png | WEB + DESKTOP / ASSET UPDATED | Actual repaired court and serve-target screenshot. |
| index.html | WEB-ONLY / NOT NEEDED | NARBEHOUSE card uses the new game, image, description and title. |
| bennyshub/apps/games/NARBEPICKLEBALL/index.html, README.md | WEB-ONLY METADATA / NOT NEEDED | Web edition label and current launch/catalog documentation. |
| bennyshub/ACCESSIBILITY.md | WEB-ONLY REFERENCE / NOT NEEDED | Identify the preserved original as a credits link. |
| bennyshub/service-worker.js | WEB-ONLY / NOT NEEDED | Cache v36 for the updated catalog. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | Scope, publication and verification record. |

The release also includes the already-pending NARBEPICKLEBALL implementation/model tests and the basketball between-shot Pause changes documented below. Its legacy scripts/check-rally-club.cjs browser fixture targets the initial prototype; it was not run or used as release evidence. Validation: all 239 Node tests pass, including 25 current pickleball model tests. The Node 22.16.0 production build passes; its audit reports 1,865 public files with no findings or problems, and all 954 checked local references pass. The immutable Companion candidate retains its recorded SHA-256. Desktop and web model, game, scene and stylesheet hashes match. Electron was not launched during this catalog refresh.

## Rally Club desktop installation authorized — 2026-10-07

The owner clarified: “this game should be on bennys pc hub too. this is where ben tests games.” The desktop pass is now completed for this game. Its existing pickleballrally ID launches NARBE Pickleball Rally with a new thumbnail and an Electron-bridge entry point. The original game is preserved through Credits. No shared managers or other catalog entries changed. The web catalog remains unchanged. Desktop documentation and exact changed files are recorded in ELECTRON-SCAN-UPGRADE.md in Benny’s PC Hub. Four model tests and 23 integration checks pass using the actual Electron hub/preload/iframe/native-settings path and an isolated profile; the report has zero renderer errors. Physical-switch testing with Ben remains next. This supersedes the Electron-pending status in the web-preview entry below for this game only.


## NARBE Rally Club preview — 2026-10-07

User-authorized pickleball redesign; this is new gameplay work, not a scan-policy conversion. The original Pickleball Rally and both catalogs remain unchanged. The separate preview uses automatic movement, continuous sweeping aim or untimed placements, drive/dink/lob, independent pace and opponent settings, optional safe in-bounds shots, and no-fail target rallies. Credits retain SCSU and Lily Flack and identify NARBE's redesign. No online publication.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/NARBEPICKLEBALL/index.html, style.css | WEB PREVIEW / ELECTRON CANDIDATE ONLY | New DOM interface and responsive court controls. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/model.js | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Deterministic rally simulation and opponent reach. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Procedural court, players and animation. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/game.js | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Shared choice adapter, independent aim mechanics, release input, pause, saves and credits. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/three.min.js, THIRD-PARTY-LICENSES.txt | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Existing local r155 dependency and retained MIT notice. |
| bennyshub/apps/games/NARBEPICKLEBALL/README.md | WEB PREVIEW / DOCUMENTATION | Controls, model limits and test coverage. |
| tests/rally-model.test.cjs, scripts/check-rally-club.cjs | WEB-ONLY / TESTS | 4 model tests and 45 browser checks pass. |
| artifacts/rally-club/ | WEB-ONLY / EVIDENCE | Test report and separately rendered screenshots. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NOT NEEDED | This record. |

Reviewed 3D rendering at desktop, tablet and phone sizes; behavioral tests additionally cover 844×390 landscape. The same input contract passes with two switches and Auto Scan: recurring blank, reverse, parking, brake, owned speech, cancellation, pause, full match/replay and save recovery. Original game backed up and verified unchanged. Actual switch-user and Electron verification remain pending; do not treat this as a released game.

Separate approved website copy: SWITCHEDGAMES/index.html retains level submissions, changes the hero link to Create With Us, replaces full-game uploads with a collaboration proposal through the existing contact form, and explains NARBE accessibility/quality review with credited collaborators. Original file backed up before edit. No form submission, external message or deployment.


## Row Back stop — 2026-10-06

The owner reported that holding Space to scan backward through Messenger’s channels returned to the Channels/Exit menu instead of staying in the list, then asked for one consistent row behavior across apps and games. Every row the player enters now loops in both directions, including held-Space reverse and Auto, through its items plus a Back stop. The Back stop says “Back”, highlights no item and draws a dashed outline around the row; choosing it returns to the same row in row mode with its normal highlight. Scanning never leaves a row on its own, and rows no longer carry their own visible Back buttons. Row mode keeps its blank between the last row and the text row, which remains the only parking place. Hold-Enter Back still works where it did.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| Web and desktop `bennyshub/shared/choice-scan-adapter.js` | SHARED / DONE ON ELECTRON | `enterGroup(items, {wrap:true, backStop:true})` adds the looping Back stop and its dashed row outline (visible part only). Space there is consumed without pausing, as on the root blank. |
| Web and desktop `bennyshub/apps/tools/keyboard/app.js`, `index.html` | SHARED / DONE ON ELECTRON | The direct controller appends its own Back stop and uses the shared outline; the page loads the adapter. |
| Web and desktop `journal/app.js`, `streaming/app.js`, `phraseboard/board-choice.js` | SHARED / DONE ON ELECTRON | Keyboard, calendar and phrase rows (Row scan style and free-placement groups) use the Back stop; Phraseboard’s “Back to groups” button stays hidden. |
| Web and desktop `BENNYSBATTLEBOATS/scan-access.js`, `BENNYSMATCHYMATCH/scan-access.js`, `ELOUISESWORDSEARCH/game.js`, `NARBEANIMALFRIENDS/js/input.js`, `ui.js` | SHARED / DONE ON ELECTRON | Row-then-item grids and the name keyboard use the Back stop; Word Search’s Back item and Animal Friends’ “Back to rows” button are replaced by it. |
| `bennyshub/apps/tools/ytsearch/js/scanning.js` | WEB-ONLY / NOT NEEDED | Keyboard rows use the Back stop. |
| `tests/choice-scan-adapter.test.cjs`, `scripts/check-keyboard-row-wrap.cjs` | WEB-ONLY / TESTS | Loop order both ways, spoken Back, same-row return, root blank, Auto without parking, empty rows, app never receiving Back, and outline geometry; the browser row check counts the stop and returns through it. |
| `AGENTS.md`, `bennyshub/ACCESSIBILITY.md` | WEB-ONLY / BEHAVIOR REFERENCE | Document the row contract. |
| `bennyshub/service-worker.js` | WEB-ONLY / NOT NEEDED | Cache v35 prepares browsers for the changed scripts. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record scope and verification. |

Desktop-only surfaces received the same change: Messenger channels, messages and composer keyboard, Search, every RT Convo row (Convo, Phrases and Typing), and the Pet Pals name keyboard, whose per-row “Rows” key is replaced by the Back stop.

`choice-scan.js` is unchanged, so the Companion’s synced copy and its 1.0.8-keyboard-wrap package are untouched; `sync-companion-shared.cjs --check` and `package-companion.cjs --check` pass with the same SHA-256. Validation: `npm test` passes (214) and the desktop scan suite passes (72). The owner tested the desktop app and reports it working. The browser row check was updated for the stop but not run in this pass.

## Predictive keyboard row speech — 2026-10-05

The owner reported that predictive keyboard rows announced generic labels such as “Word predictions” instead of reading each displayed suggestion, and requested checking all predictive keyboards in both web and desktop apps. This is a scoped repair to the current desktop integration, separately authorized from the historical port plan below.

Prediction rows now resolve their current available suggestions when scanned and speak them in display order with pauses. This covers manual forward/reverse, Auto, and nested parent-row returns. Desktop Keyboard also reads predicted letters. Empty/disabled suggestions are omitted; empty rows announce “No predictions” (or “No letter predictions”). Journal retains word-pronunciation processing. Keyboard’s long-Enter shortcut uses one announcement instead of cancelling and repeating it. The controller owns the full speech completion ticket, preserving Wait for Speech.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| Web and desktop `bennyshub/apps/tools/keyboard/app.js` | SHARED / DONE ON ELECTRON | Live word/letter prediction labels; evaluate dynamic labels; remove duplicate long-Enter speech. |
| Web and desktop `bennyshub/apps/tools/journal/app.js` | SHARED / DONE ON ELECTRON | Read current words in order, preserving pronunciation. |
| Web and desktop `bennyshub/apps/tools/streaming/keyboard_integration.js` | SHARED / DONE ON ELECTRON | Read available search predictions. |
| `bennyshub/apps/tools/ytsearch/js/scanning.js` | WEB-ONLY / NOT NEEDED | Read current prediction words, omitting blank cells. |
| `scripts/check-prediction-row-speech.cjs` | WEB-ONLY / TESTS BOTH SOURCES | Speech regressions across four web and six desktop keyboards, covering 14 prediction rows. |
| `AGENTS.md`, `bennyshub/ACCESSIBILITY.md` | WEB-ONLY / BEHAVIOR REFERENCE | Document the prediction speech contract. |
| `bennyshub/service-worker.js` | WEB-ONLY / NOT NEEDED | Cache v34 prepares browsers for fixed scripts on the next publication. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record scope, verification and desktop application. |

Desktop Messenger’s word, phrase and common-word rows, Web Search’s prediction row, and RT Convo’s typing word/phrase rows already read their contents correctly; all passed without production edits.

Validation: reproduced the original web Keyboard failure (“predictive text” in place of six words). All **14 prediction rows** passed real Space/Enter renderer checks with captured platform speech: displayed order, refreshed suggestions, blank cells, nested return, held reverse, Auto entry, Wait for Speech completion plus a full interval, and TTS Off. Empty-row fallbacks were checked on repaired keyboards. **58 focused unit tests passed.** The existing row-wrap renderer suite also passed all **13 web/desktop keyboard surfaces**, covering reverse/forward wrapping, release behavior, Auto, brake, settings, Back and key selection. Native services/storage were isolated; no messages or AI requests were sent. These checks validate renderer behavior and speech text, not the live Electron process or physical switch hardware.

Backups, staged desktop copies, failing/passing evidence and the checksum-guarded apply script are in `../Website Backups/Prediction-row-speech-20261005-1791201436145`. All three applied desktop files match their tested staged checksums. The owner authorized publication. The website publishes through the existing GitHub Pages workflow on a push to main. Pre-publication validation passed all 206 unit tests, the reviewed build, the release audit (1,182 files, no findings), 920 page references, and the unchanged Companion ZIP checksum. Cache v34 delivers the updated app scripts.


The web upgrade covers all 26 catalogue games, six tools, legacy Mini Golf, Hub menus/Settings and Companion. The owner reports the local changes working well. On October 4, 2026, the owner reported 1.0.7 submitted and awaiting approval, with 1.0.5 still public. Store status has not been independently checked in the publisher dashboard.

This public map replaces the chronological working ledger; its complete original, task notes, backups and test attempts remain preserved locally. Current policy is maintained in [ACCESSIBILITY.md](bennyshub/ACCESSIBILITY.md) and [the developer guide](developer-guide.html). See [validation](submission/VALIDATION.md) and [the test checklist](SCAN-UPGRADE-TESTING.md).

## Companion app storage and caregiver restore — 2026-10-04

Companion now keeps Journal entries and unfinished drafts, Keyboard vocabulary/preferences, Streaming library/progress/settings and Day Hub weather preferences in local extension storage. With the new capabilities connected, these copies survive clearing the Hub website's storage. No cloud account or new permission is required. Removing Companion or its browser profile can remove these copies, so caregiver exports remain available.

The manifest stays at 1.0.8. The new immutable `journal-storage` revision includes this work and the earlier video-frame correction; the original 1.0.8 and 1.0.7 archives remain unchanged. Detection uses `journal-storage-v1` and `app-storage-v1`, since the original 1.0.8 package lacks these capabilities. Older Companion versions retain browser storage. This pass is WEB-ONLY; no Electron files were changed.

Migration preserves existing data, records origin-specific receipts and waits for successful durable writes before acknowledging saves. Concurrent edits use revision checks; differing legacy data and Journal drafts retain recovery copies. Clearing website storage does not clear Companion data. Journal resumes unfinished entries through Continue Entry, and waits for initialization before enabling Entries and Options.

Companion & data → My data keeps the existing Journal export/restore location and adds matching restores for Keyboard, Streaming and Day Hub. Validated imports target only that app's keys and use the same storage clients as its actual reader. A quiet Journal backup reminder stays in the caregiver area; the recorded export time means an export was requested, not that a download was independently verified on disk. Normal switch use saves automatically.

| Files | Scope / Electron port | Change |
| --- | --- | --- |
| `extension/journal-store.mjs`, `extension/app-data-store.mjs` | COMPANION / WEB-ONLY | Serialized local stores, migration receipts, validation, recovery copies and revision protection. |
| `extension/background.mjs`, `extension/hub-content.js` | COMPANION / WEB-ONLY | Restrict storage commands to authorized Hub pages; expose capabilities and persist validated playback progress. |
| `bennyshub/shared/journal-storage.js`, `bennyshub/shared/app-storage.js` | WEB-ONLY / WEB-ONLY | Shared Companion clients, browser fallback, pending-write recovery and startup hydration. |
| `bennyshub/shared/data-backup.js`, `extension/shared/data-backup.js` | WEB / COMPANION / WEB-ONLY | Exact shared backup validator for the actual app storage formats. |
| `bennyshub/shared/extension-client.js` | WEB-ONLY / WEB-ONLY | Preserve structured storage conflict errors. |
| `bennyshub/shared/tool-gate.js` | WEB-ONLY / WEB-ONLY | Allow the native caregiver editor gate to work when no scan manager is loaded. |
| `bennyshub/apps/tools/journal/app.js`, `index.html`, `journal-look.css` | WEB-ONLY / WEB-ONLY | Automatic durable entry/draft saves, Continue Entry, inline errors and safe startup navigation; retain Journal scan behavior. |
| `bennyshub/apps/tools/keyboard/app.js`, `index.html`, `predictions.js` | WEB-ONLY / WEB-ONLY | Restore before reading preferences/vocabulary and persist explicit app writes. |
| `bennyshub/apps/tools/dayhub/app.js`, `index.html` | WEB-ONLY / WEB-ONLY | Restore and save weather preferences through the shared client. |
| `bennyshub/apps/tools/streaming/app.js`, `index.html`, `editor.html`, `editor.js`, `web-streaming.js` | WEB-ONLY / WEB-ONLY | Restore library/settings/progress, protect against stale editor saves and await playback persistence. |
| `bennyshub/index.html`, `bennyshub/data-settings.html`, `bennyshub/data-settings.js` | WEB-ONLY / WEB-ONLY | Existing caregiver export/restore area, per-app restore/clear validation and quiet Journal backup reminder. |
| `bennyshub/service-worker.js` | WEB-ONLY / WEB-ONLY | Cache v32 with the new shared storage helpers. |
| `.gitattributes`, `scripts/sync-companion-shared.cjs`, `scripts/package-companion.cjs` | RELEASE / WEB-ONLY | Canonical helper parity and reproducible immutable revision packaging. |
| `scripts/check-companion-app-storage.cjs`, `scripts/check-scan-tools-journal.cjs`, `tests/app-data-store.test.cjs`, `tests/companion-data-client.test.cjs`, `tests/data-backup.test.cjs`, `tests/journal-security.test.cjs`, `tests/journal-store.test.cjs`, `tests/streaming.test.cjs` | TEST / WEB-ONLY | Real app migration/recovery/export/restore, storage failure/concurrency/security and legacy compatibility checks; drain real Companion replies between simulated scan-clock slices. |
| `bennyshub/extension-setup.html`, `bennyshub/companion-privacy.html`, `extension/README.md`, `submission/PERMISSIONS-AND-PRIVACY.md`, `submission/REVIEWER-INSTRUCTIONS.md`, `submission/START-HERE.md`, `submission/STORE-LISTING.md`, `submission/VALIDATION.md`, `submission/COMPANION-SHA256SUMS.txt` | RELEASE / WEB-ONLY | New download, precise local-storage/privacy limits, reviewer instructions and package checksum. |
| `SCAN-UPGRADE-CHANGES.md` | DOCUMENTATION / WEB-ONLY | Record changed files, behavior, validation and desktop scope. |

Validation: 203 unit checks and five Journal scan groups passed. Real unpacked-Companion checks exercise all four legacy migrations and app readers, entry/draft saving, recovery after website storage clearing, downloaded exports/restores and browser restart. Final acceptance and release results are recorded in `submission/VALIDATION.md`. The full tracked pre-change backup and test evidence remain locally under `artifacts/journal-companion-storage`; the backup is `before-75a5d99.zip`.

## Companion 1.0.8 video-frame correction

A centered provider video could retain its CSS translation after the Companion forced its box to the reserved frame. The translated image was then clipped to its lower-right quarter at the upper left. The fitted video, intermediate surfaces and frame now clear their own transform properties while caption positioning and the native DOM hierarchy remain intact. Unlock restores the original provider styling.

- `extension/player-view.js` — COMPANION / WEB-ONLY: normalize transforms only on fitted boxes; no Electron port.
- `scripts/check-player-layout.cjs` — COMPANION TEST / WEB-ONLY: the Netflix fixture now includes a centered video to catch the clipping regression.
- `SCAN-UPGRADE-CHANGES.md` — documentation / WEB-ONLY: record this correction and its validation.

Validation: the loaded-extension layout fixtures passed for Netflix, Disney, YouTube, Plex and direct-video fullscreen, including Help resizing, captions, scan selection and Unlock restoration. Eleven player-adapter/return unit checks passed. Independent transform reproduction and screenshots are retained under `artifacts/netflix-frame-fix`. These are controlled provider fixtures; signed-in Netflix playback still needs user confirmation. The submitted 1.0.7 ZIP and archived release are unchanged; the 1.0.8 package is prepared for review and is not a store-published update.

Release preparation on October 4, 2026 uses an immutable 1.0.8 ZIP with the frame correction. Additional file ledger:

| Files | Scope / port | Release change |
| --- | --- | --- |
| `extension/manifest.json` | COMPANION / WEB-ONLY | Advance to 1.0.8; no permission changes. |
| `bennyshub/extension-setup.html`, `bennyshub/service-worker.js` | WEB-ONLY | Link the 1.0.8 testing download; refresh cached setup under v30. |
| `extension/README.md`, `WEB-EXTENSION-MIGRATION.md` | Documentation / WEB-ONLY | Describe the frame correction, new candidate and current Scan Speed behavior. |
| `submission/START-HERE.md`, `submission/STORE-LISTING.md`, `submission/REVIEWER-INSTRUCTIONS.md`, `submission/VALIDATION.md`, `submission/COMPANION-SHA256SUMS.txt` | Release records / WEB-ONLY | Current package, reviewer notes, validation and exact checksum; preserve the historical 1.0.7 submission record. |

## Companion setup tutorial — 2026-10-04

Companion & data now includes a collapsed Watch tutorial disclosure with a video icon. Opening it loads the owner's YouTube setup video in a responsive, titled player; closing either disclosure or opening another Hub screen removes the player and stops playback. It uses the existing native caregiver-menu keyboard handling and normal page scrolling. This is website-only; Companion 1.0.8 and the Electron app are unchanged.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/index.html` | WEB-ONLY | Add the accessible tutorial disclosure, responsive embed and playback cleanup. |
| `bennyshub/service-worker.js` | WEB-ONLY | Refresh the cached Hub shell under v31. |
| `SCAN-UPGRADE-CHANGES.md` | Documentation / WEB-ONLY | Record this addition and its scope. |

Validation: desktop and mobile browser checks cover collapsed startup, Enter/Space disclosure controls, exact video URL, no horizontal overflow and cleanup on parent collapse or Hub/app navigation. The public YouTube embed loaded successfully in isolated Edge. All 145 unit tests, the public build, release audit and 905-link check passed. Local backup and browser evidence are retained under `artifacts/companion-tutorial`.

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
| `bennyshub/service-worker.js` | WEB-ONLY | Offline shell with scan assets, tutorial and Companion storage helpers under v32. | WEB-ONLY |
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
| `manifest.json` | Version 1.0.8 without added permissions. |
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

## Accessibility documentation reconciliation — 2026-10-04

Verified the shipped sources before editing. Web ACCESSIBILITY.md §§4, 7–9, 11 and 12 now records all five scan speeds, all 26 catalog games (five previously missing), current cancellation handlers, optional batting/pause routes, actual Bowling oscillation periods and the distinct board scan models. Pause coverage distinguishes scan choices from pointer-only buttons and native holds; Racer is not the only remaining hold-dependent game. BENNYSMINIGOLF is identified as the separate legacy direct-URL build.

The user separately requested matching Electron documentation and Matchy Match edits in this session. The desktop root ACCESSIBILITY.md retains its native storage, bridge and Python notes, uses its actual 28-game catalog, adds Pet Pals and Sphere Splash notes, and records seven of eight tool cancellation handlers (Web Search has none). Desktop scan speeds were already correct. Desktop Matchy Match lacks the web full spoken consequence warning on open; the document now states that gap. Show n Sound's Continue-first warning remains outside the authorized app-code change.

In each build, the only application-code change swaps Cancel and Continue (Mouse Needed) in Matchy Match's editorWarning array. Existing actions, speech, defaults, timing, mechanics and scan behavior are preserved. Originals of both edited desktop files and all three web files are backed up under Website Backups/Accessibility-doc-sync-20261004-1791149761767.

Validation: npm test passed **203/203** web tests. Four headless Edge renderer checks (web/desktop source × Step/Auto) verified fresh blank focus, inert blank Enter, Cancel as the first scanned choice, return to Settings and no editor tab on Cancel. Electron has no npm test script; its native runtime was not launched. Exact comparison against backups verifies that each script differs only by the requested two-item order. Git diff --check passes.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/ACCESSIBILITY.md` | SHARED / ADAPTED ON ELECTRON | Reconcile documented controls, catalog coverage, cancellation history and pause routes. |
| `bennyshub/apps/games/BENNYSMATCHYMATCH/script.js` | ADAPTER / DONE ON ELECTRON | Put Cancel before Continue in the editor warning; preserve all other code. |
| Electron `ACCESSIBILITY.md` | DESKTOP / DONE ON ELECTRON | Apply equivalent corrections with the desktop catalog, extra games and actual tool/warning gaps. |
| Electron `bennyshub/apps/games/BENNYSMATCHYMATCH/script.js` | DESKTOP / DONE ON ELECTRON | Apply only the same two-item warning reorder to the existing desktop file. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record authorized scope, backups and validation. |

## Keyboard row compatibility repair — 2026-10-04

The owner explicitly requested repairs in both the website and the Electron app. This scoped desktop repair is authorized separately from the historical locked port plan below. The previous accessibility documentation and Matchy Match warning-order changes remain intact.

Compared the pre-conversion Keyboard, Journal and Streaming code in `Bennys-Hub-tools-before-choice-conversion-20261003` with the desktop backup dated `2026-10-04T14-37-42-938Z` (including Messenger). Native keyboard keys used modulo wrapping in both directions. The shared child-boundary policy had replaced that with a return to root blank, so another held reverse tick selected the bottom row. Keyboard groups now opt into `enterGroup(children, {wrap:true})`; root blanks, non-keyboard groups, app-owned hold thresholds, defaults and gameplay remain under their existing rules. Keyboard-local cycles do not count as completed root parking loops. Selection and native Back routes still leave the row. RT Convo keeps its existing five-second return to the text row.

Touched-file backups and the guarded desktop staging manifest are in `../Website Backups/Keyboard-row-wrap-before-20261004-1791151042905`. Existing release archives were not changed. Desktop files are patched against their own originals, preserving desktop-specific integrations and data.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| `bennyshub/shared/choice-scan.js` | SHARED / DONE ON ELECTRON | Opt-in local wrapping on the group stack; no root parking count for keyboard-local cycles. |
| `extension/shared/choice-scan.js` | WEB-ONLY / NOT NEEDED | Keep the checked-in Companion helper byte-identical; no extension install or release. |
| `bennyshub/apps/tools/keyboard/app.js`, `bennyshub/apps/tools/journal/app.js`, `bennyshub/apps/tools/streaming/app.js`, `bennyshub/apps/games/NARBEANIMALFRIENDS/js/input.js` | SHARED / DONE ON ELECTRON | Opt keyboard rows into wrapping; calendar and other nested choices keep their existing behavior. |
| `bennyshub/apps/tools/ytsearch/js/scanning.js` | WEB-ONLY / NOT NEEDED | Wrap the YouTube Search keyboard row. |
| Desktop `bennyshub/apps/tools/messenger/keyboard.js`, `bennyshub/apps/tools/search/app.js`, `bennyshub/apps/tools/rt-convo/index.html`, `bennyshub/apps/games/NARBEPETPALS/js/scan-access.js` | DESKTOP / DONE ON ELECTRON | Wrap composer, search, typing-mode and spelling rows. RT Convo non-typing board groups are unchanged. |
| `bennyshub/ACCESSIBILITY.md`; desktop root `ACCESSIBILITY.md` | SHARED / ADAPTED ON ELECTRON | Section 4 documents keyboard-local wrapping and root parking. Desktop section 11 corrects handler coverage: direct inspection confirms Web Search also registers cancellation, so all eight tools do. |
| `AGENTS.md`, `developer-guide.html` | WEB-ONLY / NOT NEEDED | Document the keyboard exception so the generic child-boundary rule cannot reintroduce this regression. |
| `tests/choice-scan-adapter.test.cjs` | WEB-ONLY / NOT NEEDED | Regression tests for repeated forward/reverse wraps, single-item rows, redraw/removal, Back, default-group isolation, five speeds, Auto, brake, speech wait and root parking. |
| `scripts/check-keyboard-row-wrap.cjs` | WEB-ONLY / TESTS BOTH SOURCES | Actual renderer regression suite with real key events and synthetic native services; optional `--desktop-root` and `--desktop-overlay`. |
| `scripts/check-scan-tools-core.cjs`, `scripts/check-scan-tools-journal.cjs`, `scripts/check-scan-tools-streaming.cjs`, `scripts/check-scan-tools-ytsearch.cjs`, `scripts/check-scan-sports-animal-deep.cjs` | WEB-ONLY / NOT NEEDED | Correct earlier assertions that encoded keyboard child-to-root exits. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record cause, authorization, backup, scope and validation. |

Validation: the three new unit regressions failed against the original scanner and pass after repair. `npm test`: 206/206 passed. Renderer checks cover five web keyboards and eight desktop keyboards, each with three complete held-Space reverse cycles, forward wrap, release behavior, Auto, brake, settings changes, native Back and key selection. Keyboard and Messenger also run held reverse at the five-second scan speed with Auto Brake Off. Native messaging, credentials, microphone and backend writes are isolated; no message is sent. These are renderer checks of the actual app files, not a claim that the live Electron process or physical switch device was exercised. Results: `artifacts/keyboard-row-wrap/report.json`.

## Authorized site publication — keyboard compatibility repair

The owner requested publishing the completed fixes. GitHub Pages deploys the reviewed `dist` artifact on a push to `main`. Canonical scanner parity changes the Companion ZIP bytes, so the build uses a separate immutable `1.0.8-keyboard-wrap` candidate (manifest remains 1.0.8); the earlier journal-storage archive is preserved. No store submission is part of this website deployment.

| Files | Scope / Electron status | Publication change |
| --- | --- | --- |
| `bennyshub/extension-setup.html` | WEB-ONLY / NOT NEEDED | Link the new immutable testing ZIP. |
| `bennyshub/service-worker.js` | WEB-ONLY / NOT NEEDED | Increment the offline shell cache to v33. |
| `extension/README.md`, `submission/START-HERE.md`, `submission/VALIDATION.md`, `submission/COMPANION-SHA256SUMS.txt` | RELEASE / NOT NEEDED | Document the exact candidate, preserved archive, keyboard validation and CI checksum. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record the authorized publishing scope and required release metadata. |

Publication metadata backups are in `../Website Backups/Keyboard-site-publish-20261004-1791151996892`. The package checksum is `4db777db1037e3ff9fd7469211ab385302cdebf25acb116cd73d433b0bbf3eab` (112,120 bytes, 29 members).

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


## 2026-10-07 — Pickleball first-person redesign requested by owner

Scope: owner explicitly requested the game in Benny’s PC Hub and then a first-person CPU match, Peggle/Bowling hold-Space reversing aim, optional auto aim, direct touch/mouse court play, and compact embedded controls. This supersedes the previous prototype controls within this game only. Desktop was already explicitly authorized; this is not an unsolicited Electron scan port.

Changed web preview files (Electron flag: already implemented in the owner-authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/index.html — direct court surface and compact HUD; web entry retains no Electron bridge.
- bennyshub/apps/games/NARBEPICKLEBALL/style.css — removes shot/aim panels; 64px court options, responsive compact score and hints.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — manual held/reversing aim, optional auto aim, immediate aiming, optional in-court Play/Pause scan, pointer capture, hold pause, cancellation and saved shot style.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — player-eye camera, facing CPU, animated hand/paddle, procedural court surface and palms; ball framing follows necessary movement.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — current controls, source scope and test evidence.
- SCAN-UPGRADE-CHANGES.md — this ledger.

Backups of the prior web preview and this ledger are in the desktop workspace under tmp/rally-first-person-backup. Original Pickleball, web catalog, shared managers, release ZIPs, dependencies and live website are unchanged. Desktop controls passed the actual Hub fixture; pointer/touch and responsive tests cover the common game code. Test evidence remains local under tmp/rally-electron and tmp/rally-first-person in the desktop workspace.



## 2026-10-07 — Pickleball direct shot scan and continuous bounce

Owner-requested game follow-up, implemented first in the explicitly authorized desktop Hub. Scope: Space/Enter must reach Drive, Dink and Lob directly on court, and returns must visibly bounce in slow motion to the paddle. The court scan now offers Drive, Dink, Lob and Pause before aiming. Held/reversing Space remains the aim control after selecting a shot. Ball flights now distinguish bounce and contact, slow on the player approach, and keep their position continuous at CPU return and ready state. Initial serves and between-point feeds are animated too.

Changed web files (Electron flag: already applied and tested in the authorized desktop build):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — continuous bounce/contact paths, slow approach, serve feed and old-save flight migration.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — direct shot scan, selection previews, settings/help and bounce cue.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — trajectory preview and ball spin synchronized to flight.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — current controls and validation.
- SCAN-UPGRADE-CHANGES.md — this ledger.

Backup: desktop tmp/rally-shot-bounce-backup, including the prior web game and ledger. Desktop validation passes 39 native Hub checks, 21 browser checks and 8 simulation tests. Actual rendered bounce/ready/shot-selection screenshots reviewed. Shared managers, original game, catalogs, releases and live deployment are unchanged.



## 2026-10-07 — Robot Pickleball, automatic paddle and accessible movement

Owner-requested game work, already explicitly authorized in Benny's desktop Hub. Final play uses automatic forehand/backhand returns and positioning-based contact, Space/Enter left/right controls, alternating one-switch control, optional tap-without-hold movement and automatic depth coverage. Full speed, slower approaches and stopped-ball no-fail play are available. Every rally offers Serve/Pause through the shared CHOICE scan. Scoring tracks service and uses standard singles side-outs and 11/win-by-two; serves are diagonal from the proper baseline side. Robots replace every humanoid, including the first-person hand. Lily's original and credit remain.

Changed web files (Electron flag: already implemented and tested in the owner-authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/index.html — compact Serve/Pause controls; no Electron bridge.
- bennyshub/apps/games/NARBEPICKLEBALL/style.css — short-screen hint placement and court controls.
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — service ownership, scoring guards, automatic contact quality, depth coverage and full-speed flight.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — one/two-switch and no-hold movement, automatic returns, no-fail waiting, neutral Continue and owned pause timers.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — robot athletes/crowd/gripper, forehand/backhand poses and reach animation.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — final controls, rules, scope and verification.
- SCAN-UPGRADE-CHANGES.md — this ledger.

Backups live in the desktop workspace under tmp/rally-move-charge-backup and tmp/rally-robot-backup. Fifteen model tests and 32 actual native Hub checks pass. The desktop browser run and this F-drive prototype each pass 45 checks, with no runtime errors; rendered mobile/desktop layouts reviewed. CSS and all three game JavaScript files match the desktop by SHA-256. Shared managers, original game, web catalog, release ZIPs and live deployment remain unchanged.


## 2026-10-07 — Club sign, Enter steering, target taps and automatic matches

Owner-requested desktop testing refinements, mirrored to this prototype. The NARBE RALLY CLUB sign has padded text fitting and is raised above the robot; movement tiers are about one-third faster with saved-setting migration. Tap input targets the incoming contact position and stops without overshoot; it remains timed and forgiving outside No-fail. Hub Auto Scan now enables Enter-only alternating held movement as Racer does. Opponent selection and the result menu are removed; completed matches automatically prepare the next opponent at Serve/Pause. No-fail and Just rally offer the same blank Serve/Pause break after six returns without changing service or scores.

Changed web files (Electron flag: already implemented in the explicitly authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — bounded target movement, faster default and current return prompts.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — input integration, speed migration, tap targeting, automatic opponent sequence and periodic no-fail break.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — fitted, raised NARBE RALLY CLUB sign.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — revised behavior and verification.
- SCAN-UPGRADE-CHANGES.md — this record.

Backup: desktop tmp/rally-tap-refinement-backup contains prior desktop/web game files, tests, thumbnail and ledgers. Seventeen model tests pass. Thirty-seven native Hub checks verify Enter-only controls, no-overshoot taps, input cancellation and saved settings in an isolated profile. The initial desktop browser run passes 57 checks; additional checks cover the subsequently requested periodic no-fail breaks and timed tap deadlines. Final browser verification is recorded below. The web catalog, original game and live deployment remain unchanged.

Final expanded verification: all 67 browser checks pass on the synchronized F-drive prototype with no runtime errors. This covers early and late full-speed taps, continued timed play beyond six returns, regular No-fail/Just rally Serve/Pause breaks, blank Enter safety, short-press Pause access and final-shot target-star retention. Report: desktop tmp/rally-tap-refinement-web-check/browser-report.json. The earlier desktop 57-check and native 37-check reports are retained in tmp/rally-tap-refinement. The short practice cue reads BREAK EVERY 6 for small-screen fit.


## 2026-10-07 — Armed direction, physical paddle contacts and score-free practice

Explicit owner-requested follow-up in the desktop Hub and matching web prototype. A compact, noninteractive arrow shows NEXT HOLD left/right in one-switch held play and HOLDING while moving; it is absent from choice menus, tap targeting and two-switch play. The home entry is now Settings. Short Enter gameplay presses never pause; the six-second pause timer verifies continuous ownership by the initiating held input. Selecting Serve cancels the old prompt and says You serve or Robot serves.

The CPU moves beside and behind the contact point. Articulated shoulder/elbow/gripper poses put its paddle face one ball radius from contact for forehand, backhand, low and overhead returns, with follow-through. Body collisions resolve as paddle misses instead of passing through the robot. First-person paddle height/side follow the ball; low-shot depth keeps contact visible. Once aligned after a one-switch or tap input, the remaining approach finishes continuously in about 0.22 seconds after the bounce (up to 0.5 seconds before it), retaining the bounce and timed-mode deadline. Bench robot thighs now rest above the seat, with knees/shins beyond the edge. No-fail and Just rally suppress points, wins, target stars and the scoreboard; only returns-until-break remains. The six-return Serve/Pause break remains available.

Changed game files: index.html, style.css, js/model.js, js/game.js, js/scene.js and README.md under bennyshub/apps/games/NARBEPICKLEBALL. Electron flag: already implemented in the explicitly authorized desktop game. The web entry omits the Electron bridge and keeps WEB PREVIEW. This change ledger is updated. Desktop-only updates also include ACCESSIBILITY.md, ELECTRON-SCAN-UPGRADE.md, all three tests/rally-* fixtures and the rendered bennyshub/images/games/narbe-pickleball-court.png thumbnail.

Backups: desktop tmp/rally-direction-cue-backup and tmp/rally-contact-backup. Validation so far: 21 model tests, 80 desktop browser checks and 41 native Hub checks. Native testing uses real input events in an isolated profile; short Enter presses move, and six-second holds pause. CPU paddle-face contact was measured at exactly the 0.135 ball radius for all four stroke poses; actual one-switch and tap post-bounce quick returns measured about 222 ms. Mobile/desktop direction cues, stroke poses and spectator seating were visually reviewed. Evidence: desktop tmp/rally-contact-review. Final prototype verification follows below.

Final verification: the synchronized F-drive prototype passes all 80 browser checks with no runtime errors. The final model passes all 21 tests. Desktop native input evidence remains 41 passing checks. CSS, model, controller, renderer and README match desktop by SHA-256; entry HTML differs only by the intentional Electron bridge and preview label. Reports: desktop tmp/rally-contact-web-check/browser-report.json and tmp/rally-contact-review. Original Pickleball, shared managers, catalog identities and release packages remain unchanged.


## 2026-10-07 — Incoming-ball one-switch direction and fixed robot arms

Owner-requested follow-up in Benny's PC Hub and the matching F-drive prototype. For each opponent return, a fresh one-switch Enter press chooses the direction toward its receiving/contact position, even while the ball is still on the opposite side of the court. It can choose the same direction on successive presses. The cue uses the same decision, shows READY when already aligned, and the direction remains fixed throughout a hold. Release stops movement; the six-second pause behavior is retained. Outside an incoming return, alternating repositioning remains. Help text and the desktop catalog description now reflect this change.

Both visible paddle arms use fixed upper-arm and forearm lengths through a two-joint solver. The CPU stands closer laterally and forward to the ball, crouches slightly for low returns, and keeps its feet grounded. Its paddle is scaled to match the normal arm reach. Physically unreachable shots resolve as misses rather than extending the arm. The first-person arm also retains fixed lengths, with a small lean/crouch for wide and low contacts. Forehand, backhand, low and overhead strokes still meet the ball.

Changed web files (Electron flag: already implemented and tested in the explicitly authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — incoming receiving-side input and cue, instructions.
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — closer footwork and physical paddle reach.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — fixed-length joints, contact poses and low-shot stance.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — current behavior and verification.
- SCAN-UPGRADE-CHANGES.md — this record.

Desktop-only changes: bennyshub/apps/games/games.json (description only), ACCESSIBILITY.md, ELECTRON-SCAN-UPGRADE.md and the three tests/rally-* fixtures. Backup: desktop tmp/rally-ball-direction-backup, including the prior F-drive files and ledger.

Validation: all 22 model tests, 84 desktop browser checks, 84 synchronized F-drive browser checks and 41 native Hub checks pass with no runtime errors. The new browser cases cover the receiving-side direction while the ball is on the opposite side, a fresh press toward that position, and READY feedback. Rendered measurements across both sides and three heights confirm CPU segment lengths 0.46/0.44 and first-person lengths 0.44/0.42, with paddle-face contact one ball radius (0.135) away. Evidence: desktop tmp/rally-ball-direction-review and tmp/rally-ball-direction-web-check. The four synchronized game files match by SHA-256. Lily's original still matches its pre-redesign backup; shared managers, other games, web catalog, release packages and the production profile were not changed. No live deployment.


## 2026-10-07 — Correct paddle orientation and head/torso clearance

Owner-requested correction in the desktop game and F-drive prototype. The first-person arm base is lower and behind the paddle, with separate low/normal/overhead heights; its elbow bends toward the player instead of leaving an upper-arm segment ahead of the resting paddle. The opponent holds its ready paddle slightly angled in front, with its elbow behind the grip. A supported forward shoulder mount, height-dependent elbow bend and forward limits on recovery keep the arm out of the head and torso. CPU receiving depth and physical-reach calculations use the same mount. Fixed limb lengths and actual ball/paddle contacts are retained.

Changed web files (Electron flag: already implemented in the explicitly authorized Benny's PC Hub game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — shared shoulder position and corresponding receiving depth/reach.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — player arm orientation, front ready grip, shoulder mount and full swing clearance.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — corrected poses and verification.
- SCAN-UPGRADE-CHANGES.md — this record.

Desktop-only changes: tests/rally-arm-poses.cjs (new repeatable rendering regression), ELECTRON-SCAN-UPGRADE.md. Backup: desktop tmp/rally-arm-facing-backup, including previous desktop/web sources and both ledgers. Controls and camera framing are unchanged.

Validation: all 22 model tests and 84 desktop browser checks pass. The new rendering fixture passes on both desktop and synchronized F-drive source: 27 complete shot/position combinations spanning 5,940 frames, conservative capsule-versus-head/torso clearance, constant limb lengths, 16 first-person contact poses with the shoulder behind the paddle, and six CPU contacts one ball radius from the face. Close-up ready/overhead and first-person low/normal/overhead images were reviewed. Evidence: desktop tmp/rally-arm-facing-review and tmp/rally-arm-facing-web-check. The three copied game files match by SHA-256. No shared managers, original game, release packages or personal profile changed; no live deployment.

## 2026-10-07 — Rebuild both robots' paddle arms; footwork without warping; serve aim

Owner-requested fix in the desktop game (Benny's PC Hub, where Ben tests) and the F-drive prototype. The previous attempt was replaced, not tuned: its player arm could stretch, switch sides or float, and the opponent's elbow bent inside out through its head and body. Both robots now share one paddle arm on a shoulder socket fixed to the torso, with fixed-length upper arm and forearm and an elbow solve with joint limits that swivels away from the head and torso. Each stroke (forehand, backhand, low, overhead and the underhand serve) runs take-back, contact, follow-through and recovery; take-back and finish turn the contact arm at the shoulder so elbow and wrist stay natural, and every stroke swings through the ball. Reach comes from footwork: an eased step capped at a stepping pace, a crouch and torso turn. Displayed robots never move faster than a sprint, robots walk to their serve spots between points instead of appearing there, and mouse/touch dragging runs the robot to the spot. First person looks out through the player robot's visor and briefly follows the ball onto the paddle. Serve aim: two-switch Space holds move the target (release stops, each hold reverses), One switch and Tap sweep it by itself, Enter stops it on the press and the release serves; the target stays in the legal diagonal box, shown by a glowing box, target ring, flight arc and a pin of light with a direction chevron; a six-second Enter hold pauses instead; robot serves need no aim.

Changed web files (Electron flag: already implemented in the explicitly authorized Benny's PC Hub game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — stroke zones and footwork reach, player stance depth, serve aim limits, walk to serve spots.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — shared arm rig, joint-space strokes and clearance, eased footwork and no-warp follower, visor camera, serve aim visuals.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — serve aim controls, continuous pointer movement, help text.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — behavior and verification.
- bennyshub/ACCESSIBILITY.md — added the missing NARBE Robot Pickleball row (F-drive copy only had Pickleball Rally).
- tests/rally-model.test.cjs — replaced the stale F-drive copy, which already failed (it tested an older first-to-seven/target-mode version), with the maintained desktop test.
- SCAN-UPGRADE-CHANGES.md — this record.

Desktop-only changes: ACCESSIBILITY.md (row updated), ELECTRON-SCAN-UPGRADE.md, new Node-only tests/rally-arm-rig.test.cjs, tests/rally-game-controls.test.cjs, tests/rally-visual-review.cjs and tests/rally-stroke-tuner.cjs; tests/rally-arm-poses.cjs removed (superseded; it read arm internals that no longer exist). Backup: desktop tmp/rally-arm-rebuild-backup (desktop sources before this change; F-drive sources, ledger and accessibility guide before sync). The unfinished attempt's backup remains at tmp/rally-attached-arm-backup. index.html and style.css are unchanged on both sides.

Validation (Node only; no browser, Electron or GPU on this PC): rally-model 25/25, rally-arm-rig 7/7 and rally-game-controls 10/10 pass on the desktop files and on the synchronized F-drive prototype. A 40,557-frame vertex sweep found no arm or paddle penetration of either robot's own head, torso or legs. Review sheets rendered from the real scene graph were inspected. Not run: tests/rally-browser.cjs, tests/rally-electron.cjs and scripts/check-rally-club.cjs, which may need the new serve-aim step. Ben's physical-switch play test is still needed.

### Follow-up — serve aim covers the whole legal box

Owner feedback: the aim swept only a narrow band near the receiving robot. The target now sweeps the whole diagonal service box (centre line/T to sideline, still never into the other box, which would be a fault) and the serve lands deep, about a metre inside the baseline (model SERVE_DEPTH). The receiving robot waits behind its baseline instead of standing on the target, so wide and T serves make it move. While aiming, the first-person view eases up and zooms toward the far box; the target ring is smaller so it stays inside the lines. Files: model.js, scene.js, game.js, README.md, tests/rally-model.test.cjs (synchronized to the F-drive prototype). Backup of the previous versions: desktop tmp/rally-arm-rebuild-backup/before-serve-aim-wide. Validation: rally-model 25/25, rally-arm-rig 7/7 and rally-game-controls 10/10 on desktop and F-drive copies; serve-aim review renders inspected.
