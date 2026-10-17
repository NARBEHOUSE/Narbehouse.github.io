# Development history

Detailed implementation and verification records for Benny’s Hub and the NARBE House website. This file was formerly SCAN-UPGRADE-CHANGES.md; its scope now covers all development. Historical entries retain the names and status recorded at the time. Start with [the documentation index](../README.md) for maintained guidance.

## 2026-10-17 - RTC Lite listening, context and reply variety

The owner reported a Whisper warning that remained after successful loading, delayed new context while refreshing, and suggestions with similar meanings. The owner also requested RTC-Convo board in the Hub Tools description.

Reproduced the stale footer with the prior published app even while the microphone was listening. Speech setup errors now stay in the microphone and Listening settings. Only an actual local model-file miss gets setup guidance, using the current Load speech model label. Runtime failures retain their actual message.

Reproduced lost transcripts with delayed recognition: app narration cleared already-captured audio and caused completed results to be discarded when the speech epoch changed. Capture still pauses during app speech, but already-captured segments and valid pending results survive later narration. Stopping or changing the recognition session still invalidates results. The listening panel now shows when recognition is processing recent speech.

The shared local/cloud board prompt gives all eight positions distinct conversational purposes and asks for different meanings across the whole board, including both agreement and disagreement when appropriate. It preserves optional user-selected speech, bounded JSON output, existing provider limits and the existing repair budget. The separately deployed BYOK Worker imports this shared prompt. No provider keys or real conversation were used in tests.

Validation: 262 website tests, five Worker integration tests and TypeScript checks pass. Nine focused browser checks cover missing model, successful setup, reload, recognition activity, context arriving during narration and a pending refresh, and preserving that newer context when the older refresh completes. The existing Worker browser check passes with four synthetic provider calls and four layouts from 800 x 600 to 1366 x 900. Real Whisper base.en transcribed a locally synthesized 5.62-second sample twice correctly in 6.63 and 5.68 seconds on this PC; these measurements do not establish speed or microphone quality on Ben's device. The build, public audit and page-link checks pass. Evidence: local websites workspace tmp/spheresplash-sync-20261017/rtc-*.

Files and scope:
- `bennyshub/apps/tools/rtc-lite/app.js` - WEB ONLY / status display; no desktop port.
- `bennyshub/apps/tools/rtc-lite/speech.js` - WEB ONLY / preserve captured speech and report recognition activity; no desktop port.
- `bennyshub/apps/tools/rtc-lite/whisper-worker.js` - WEB ONLY / accurate setup errors; no desktop port.
- `bennyshub/apps/tools/rtc-lite/core.js` - WEB AND BYOK WORKER / varied reply prompt; no desktop port.
- `bennyshub/apps/tools/rtc-lite/README.md` - WEB documentation; no desktop port.
- `bennyshub/index.html` - WEB ONLY / Tools description; no desktop port.
- `bennyshub/service-worker.js` - WEB ONLY / cache v45; model caches preserved.
- `tests/rtc-speech.test.cjs` - WEB tests / delayed transcription, narration, cancellation and worker errors.
- `CHANGELOG.md` - WEB release summary.
- `docs/history/DEVELOPMENT-HISTORY.md` - WEB detailed record.

## 2026-10-17 - Sphere Splash is a new concept

The owner clarified that Benny's Sphere Splash is a new concept. Its homepage badge now says New Concept, matching the SwitchedGames card, Details classification and New concepts filter. Game runtime and assets are unchanged.

Files: `index.html`, `CHANGELOG.md` and `docs/history/DEVELOPMENT-HISTORY.md` - WEB ONLY / no desktop port. Validation checks the scoped homepage badge and preserved catalog data; publication runs the existing release checks.


## 2026-10-17 - New games, desktop audio sync, listings and documentation organization

Owner authorized publishing the pending RTC Lite/BYOK and Chasing Rainbows updates, importing Pet Pals and Magic Button changes from the PC Hub, adding Sphere Splash, updating its PC Hub copy with the newer audio, and updating SwitchedGames and the NARBE House homepage. The owner also requested organizing the root development documents.

Pet Pals: copied eight changed files across the two games, with byte-for-byte verification against the PC Hub; gentler needs/reminders, spoken moments and Rush assistance. Magic Button: optional Simple High Contrast and six colors; Regular remains the default. Both web entry points retain analytics/favicons and omit the native bridge. 36 focused browser checks passed, including saves, naming, switch menus, Rush timing/help/decline and all regular/simple scenes; rendered captures reviewed.

Sphere Splash: imported the supplied game with 1,667 recorded voice clips; preserved the PC Hub's graphics integration when reconciling the newer audio/game files. Shared gameplay/assets match desktop by SHA-256 (1,738 files); the native bridge entry remains desktop-specific. New 1920 x 1080 actual-gameplay thumbnail and Bryan R. (Ben's other big brother), working in collaboration with NARBE LLC credit are present in the game and listings. 43 focused browser assertions passed for boot, menu safety, switch entry, choices waiting, pause, four graphics choices, six new decoded clips, save/reload, layout at three desktop sizes, and website listing handlers/details. All voice-index, WAV and quick simulation checks passed. No Electron runtime/installer or target-device test was run. Final catalog/browser review passed 19 checks with live Tailwind/Lucide resources: screenshot loading, credits, links, favorites, filters, mobile layout and homepage game launches. No missing local listing assets or SwitchedGames JavaScript errors.

Both catalogs contain 30 games. NARBE House now lists Sphere Splash and Chasing Rainbows alongside refreshed Pet Pals/Magic Button cards. The service-worker cache is v44. Runtime audio, licenses and thumbnails remain tracked; generated builds, private publishing records, test screenshots, local backups and dependencies remain excluded.

Six root documents moved into docs/development, docs/testing and docs/history, with a documentation index and repository map. This development-history name supersedes SCAN-UPGRADE-CHANGES.md. Links, project instructions and source-handoff references follow the new paths. Historical workstation paths are described by local-workspace labels; original evidence and backups remain outside the repository. Root README, CHANGELOG, AGENTS and LICENSE remain conventional entry points.

Validation: 257 website tests, production build, 3,772-file public audit (no problems), 1,142 local page references, 47 documentation links and the 4,211-file source handoff audit pass. Companion ZIP remains byte-identical (SHA-256 4db777db1037e3ff9fd7469211ab385302cdebf25acb116cd73d433b0bbf3eab). Prior RTC Lite tests/provider fixtures are documented in its entry; no live-provider call was added. Publication status is recorded by the resulting Git commits and workflows.

Evidence and originals: local websites workspace tmp/petpals-magicbutton-sync-20261017 and tmp/spheresplash-sync-20261017. SwitchedGames records its own file scope in CHANGELOG.md; desktop changes are recorded in ELECTRON-SCAN-UPGRADE.md.

Per-file scope for this combined website release (including the already-pending changes):
- `AGENTS.md` - WEB ONLY / no desktop port
- `CHANGELOG.md` - WEB ONLY / no desktop port
- `GRAPHICS-DESKTOP-PARITY.md` - MOVED / web documentation
- `GRAPHICS-QUALITY.md` - MOVED / web documentation
- `GRAPHICS-VALIDATION.md` - MOVED / web documentation
- `README.md` - WEB ONLY / no desktop port
- `SCAN-UPGRADE-CHANGES.md` - MOVED / web documentation
- `SCAN-UPGRADE-TESTING.md` - MOVED / web documentation
- `WEB-EXTENSION-MIGRATION.md` - MOVED / web documentation
- `bennyshub/ACCESSIBILITY.md` - WEB ONLY / no desktop port
- `bennyshub/apps/games/CHASINGRAINBOWS/LICENSE` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/README.md` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/js/app.js` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/NARBEMAGICBUTTON/css/style.css` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEMAGICBUTTON/js/scenes.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEMAGICBUTTON/js/settings.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEMAGICBUTTON/js/ui.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/css/style.css` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/js/companions.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/js/game.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/js/tricks.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/games.json` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/tools.json` - WEB ONLY / no desktop port
- `bennyshub/service-worker.js` - WEB ONLY / no desktop port
- `developer-guide.html` - WEB ONLY / no desktop port
- `extension/README.md` - WEB ONLY / no desktop port
- `index.html` - WEB ONLY / no desktop port
- `scripts/README.md` - WEB ONLY / no desktop port
- `scripts/build.cjs` - WEB ONLY / no desktop port
- `scripts/prepare-github.cjs` - WEB ONLY / no desktop port
- `submission/START-HERE.md` - WEB ONLY / no desktop port
- `submission/VALIDATION.md` - WEB ONLY / no desktop port
- `bennyshub/apps/games/BENNYSSPHERESPLASH/.gitignore` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/CREDITS.md` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/DESIGN.md` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/README.md` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/bed.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/groan.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/roar.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/swell.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/goal.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/lose.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/theme.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/win.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/block.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/catch.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/decision.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/goal.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/move.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/pass.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/save.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/select.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/shot.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tackle.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tech.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick1.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick2.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick3.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick4.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick5.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/whistle.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_draw_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_goal_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_goal_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_goal_3.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_int_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_int_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_save_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_save_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pa_ot_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_block_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_break_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_kick_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_kick_3.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_loose_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_loose_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_loose_3.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_short_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_shot_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/index.json` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_call/pbp_int_3_a.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_full_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_half_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_second_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_second_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__eight.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__eleven.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__fifteen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__five.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__four.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__fourteen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__nine.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__one.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__seven.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__six.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__ten.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__thirteen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__three.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__twelve.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__two.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__zero.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__beamin-blast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__drain-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__ghost-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__rebound-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__slipstream.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__snooze-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__snooze-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__snooze-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__spin-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__sting-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__sting-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-beamin-blast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-save.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-snooze-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__tough-shell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__wilt-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__wilt-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__ace-marlowe-spin-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__ace-marlowe-super-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__benji-tide-spin-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__brun-glacier-bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__cass-lumen-long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__cass-lumen-wilt-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__duke-anchor-drain-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__elowen-moss-long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__elowen-moss-wilt-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__grom-ridge-bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__kai-coral-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__mara-kelp-long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__moku-tusk-bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__nix-cogsworth-snooze-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__nova-brightwater-wilt-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__orin-willow-wilt-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__oska-tundra-drain-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__otto-shoal-sting-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__pip-harbor-super-save.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__rikka-bolt-snooze-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__rory-reef-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__rua-ironshell-wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__sol-beacon-super-save.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__sylvie-fern-ghost-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__tala-boulder-snooze-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__tala-boulder-sting-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__thorne-bramble-wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__tor-crag-tough-shell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__vera-mast-wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__vex-flywheel-snooze-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__zip-sprocket-slipstream.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/css/ss.css` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/index.html` - WEB ENTRY / desktop native entry preserved
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/ai.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/audio-files.generated.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/audio.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/broadcast.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/data.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/director.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/game.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/hud.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/main.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/model-data.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/models.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/modes.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/moves.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/replay.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/rig.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/save.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/sim.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/theme.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/ui.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/util.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/vendor/three-addons.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/vendor/three.min.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/voice-index.generated.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/voice-lines.generated.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/world.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/worldui.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/ablate.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build-voice-lines.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/bundle-addons.mjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/package-lock.json` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/package.json` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/prep-models.mjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-audio.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-browser.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-firefox-match.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-firefox-sound.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-sim.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-voice.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/dump-voice-cast.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/generate-audio.mjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/CHASINGRAINBOWS/.gitignore` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/CREDITS.md` - BOTH / existing scoped desktop changes
- `bennyshub/apps/tools/rtc-lite/README.md` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/RTC-LITE-CONTEXT.md` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/THIRD-PARTY-NOTICES.txt` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/ai-generation.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/ai-worker.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/api-server.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/app.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/core.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/dictionary.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/index.html` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/providers.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/speech.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/APACHE-2.0-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/KOFFI-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/LOGLEVEL-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/ONNX-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/PARAKEET-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/SHERPA-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/TRANSFORMERS-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/TVM-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/TVM-NOTICE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/WEBLLM-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/WHISPER-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/manifest.json` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/ort-wasm-simd.wasm` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/ort-wasm.wasm` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/transformers.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/webllm.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/web-config.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/whisper-worker.js` - WEB ONLY / no desktop port
- `bennyshub/images/games/bennyspheresplash-20261017.png` - WEB ONLY / no desktop port
- `bennyshub/images/games/chasingrainbows.png` - WEB ONLY / no desktop port
- `bennyshub/images/tools/rtc-lite.png` - WEB ONLY / no desktop port
- `bennyshub/shared/byok-client.js` - WEB ONLY / no desktop port
- `docs/README.md` - WEB ONLY / no desktop port
- `docs/development/GRAPHICS-DESKTOP-PARITY.md` - WEB ONLY / no desktop port
- `docs/development/GRAPHICS-QUALITY.md` - WEB ONLY / no desktop port
- `docs/development/WEB-COMPANION.md` - WEB ONLY / no desktop port
- `docs/history/DEVELOPMENT-HISTORY.md` - WEB ONLY / no desktop port
- `docs/testing/GRAPHICS-VALIDATION.md` - WEB ONLY / no desktop port
- `docs/testing/SWITCH-ACCESS-TESTING.md` - WEB ONLY / no desktop port
- `workers/byok/README.md` - WEB ONLY / no desktop port
- `workers/byok/package-lock.json` - WEB ONLY / no desktop port
- `workers/byok/package.json` - WEB ONLY / no desktop port
- `workers/byok/src/assets.d.ts` - WEB ONLY / no desktop port
- `workers/byok/src/rtc.ts` - WEB ONLY / no desktop port
- `workers/byok/src/setup-client.txt` - WEB ONLY / no desktop port
- `workers/byok/src/setup.html` - WEB ONLY / no desktop port
- `workers/byok/src/setup.ts` - WEB ONLY / no desktop port
- `workers/byok/src/util.ts` - WEB ONLY / no desktop port
- `workers/byok/src/vault.ts` - WEB ONLY / no desktop port
- `workers/byok/src/worker.ts` - WEB ONLY / no desktop port
- `workers/byok/tests/browser.mjs` - WEB ONLY / no desktop port
- `workers/byok/tests/fixture.mjs` - WEB ONLY / no desktop port
- `workers/byok/tests/worker.test.mjs` - WEB ONLY / no desktop port
- `workers/byok/tools/initialize-vault.mjs` - WEB ONLY / no desktop port
- `workers/byok/tsconfig.json` - WEB ONLY / no desktop port
- `workers/byok/worker-configuration.d.ts` - WEB ONLY / no desktop port
- `workers/byok/wrangler.jsonc` - WEB ONLY / no desktop port


## Chasing Rainbows credits and public listings — 2026-10-17 (LOCAL ONLY)

- Apply the rightsholder’s requested public credit, approved home URL and social handle to README.md, CREDITS.md, LICENSE, NOTICE.md and js/app.js. Spoken credits include the copyright and attribution; the creator website is a switch-reachable choice.
- Preserve MIT for NARBE’s implementation and the separate rights in original game content, artwork, branding and Nunito. Record the supplied no-code licensing choice and selected publishing scope; keep the signed form private.
- Add Chasing Rainbows to bennyshub/apps/games/games.json and its missing bennyshub/images/games/chasingrainbows.png thumbnail. Refresh the existing PC Hub manifest entry and match its game notices/credits (Electron port flag: applied for these requested game-specific changes only). Gameplay and shared scan behavior are unchanged.
- Add the game-local .gitignore; exclude rights and publishing folders in scripts/build.cjs and scripts/prepare-github.cjs. Build includes the game README with its existing public notices.
- Prepare SwitchedGames index.html and README.md with the same requested attribution, existing hosted thumbnail and canonical game URL. Update its catalog counts and multiplayer classification.
- Validation: headless checks pass for exact visible credits, native/browser creator links, switch selection and Back focus in both game editions; catalog search, multiplayer filtering, details, links and favorites pass. Both manifest game/image paths resolve. The staged build, 2,019-file release audit and 1,080 link checks pass; private-folder sentinel files are excluded. These are Node DOM checks, not rendered-pixel, speech-hardware or physical-switch tests.
- No push or deployment. The owner will publish from the website workspace. Existing unrelated local website edits are preserved.

# Web scan implementation and Companion 1.0.8

## Chasing Rainbows Action prompts and legend explanations — 2026-10-15

Scope: follow-up creator feedback for both web and Benny's PC Hub. The existing engine already offers every eligible Cloud holder a response, but the old default UI preference silently allowed Actions involving other players. Always ask is now the default; unversioned legacy affects settings migrate once. Never ask is preserved, as are quieter choices made under the new settings version. All choices remain untimed CHOICE scans; scanner behavior and the engine's turn rules are unchanged.

Fog Skip was verified after draws and combos with 2–6 players in Full/Lite, including hands over seven. The one-off report before discarding was not reproduced. Once a discard is committed, only further discards are legal; the turn instructions, Discard row and How to Play now explain that Actions come first. Day/Night card descriptions and first-draw tips now include Storm Shuffle as well as Wind Trade and pairing, preserving Night's last-card winning discard exception.

Changed game files (BOTH / PORTED): js/app.js, js/cards.js, js/words.js, js/menus.js, README.md, README-ACCESSIBLE.md, SPEC.md, tests/actions.test.cjs, tests/actions-dom.cjs, tests/october14-dom.cjs (shared test harness). Web-only: SCAN-UPGRADE-CHANGES.md. Desktop-only: ELECTRON-SCAN-UPGRADE.md. Desktop-specific differences are preserved by applying the web diff to the existing desktop files. No manifest, private feedback, licensing, shared scan controller or installer change.

Validation: 69 game checks and 257 website tests pass. Nine new focused rules/menu/narration checks cover Full/Lite action eligibility and 3–6-player blocking. Sixteen new actual-page Node DOM scenarios cover all four Actions involving CPUs, default and migrated settings, deliberate quieter settings, shared-switch privacy and Auto Scan, canceling a discard confirmation, and spoken Day/Night tips. The eight prior October 14 switch scenarios also pass. Desktop checks and website packaging results are saved with the installation evidence. Node DOM testing does not verify pixels, real speech, or physical switches; no browser or Electron process was launched.

Evidence and backups: [local websites workspace]/tmp/chasingrainbows-actions-20261015/.


## Chasing Rainbows licensing clarification — 2026-10-15

Scope: owner requested explicit open-source-code versus retained game/artwork rights in the README and license notices. No gameplay or scanner changes. NARBE's original implementation remains MIT; artwork, protected third-party rule wording (including embedded text), branding and reference materials are excluded, and Nunito keeps its OFL license. Existing Inclusive Imagination LLC and Adam M Botsford credits are preserved. The notices do not claim exclusive copyright in abstract concepts/methods of play or establish that a rightsholder agreement has been signed.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/CHASINGRAINBOWS/README.md | BOTH / PORTED | Prominent code/content ownership table and links. |
| bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md | BOTH / PORTED | Specific content exclusions, attribution, font and permission-status explanation. |
| bennyshub/apps/games/CHASINGRAINBOWS/LICENSE | BOTH / PORTED | Local MIT code license with clearly separated third-party content scope. |
| README.md | WEB-ONLY | Repository overview points to the game's separate content terms. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY | This record. |
| ELECTRON-SCAN-UPGRADE.md | DESKTOP-ONLY | Matching documentation record. |

Validation: reviewed local notice links and code/content boundaries; build, Pages checks and the existing Companion license guard verify the documentation packaging. The root/Companion license text, game code, manifest and private CHanges-October14 feedback are unchanged. No Electron runtime or installer work. Form drafts and backups remain outside the repository at [local websites workspace]/Game Submission Permission Draft/ and [local websites workspace]/tmp/game-permissions-20261015/.


## Chasing Rainbows October 14 feedback — 2026-10-15

Scope: owner requested these fixes in both the website and Benny's PC Hub. This explicitly authorizes this game's desktop pass. Four named presets now show the requested complexity labels; House Rules remains a custom setup. New games win after their required combos with no Legends and at most seven cards in hand. Both Race presets draw, play combos and pass chosen cards to the next seat on the right. Passes are mandatory while holding cards, with extra passes to reach seven; empty piles skip the draw. New pass choices use the existing CHOICE scanner, hand-card highlights, row Back, optional confirmation and private handoff inbox. Help, AI, display events and the desktop catalog description follow the new rules. Existing saves keep their stored original rules and announce that on Continue.

Changed files in CHASINGRAINBOWS (WEB + ELECTRON, port applied): js/engine.js, js/ai.js, js/menus.js, js/words.js, js/display.js, js/table.js, js/app.js, css/style.css, README.md, README-ACCESSIBLE.md, SPEC.md, tests/rules.test.cjs, tests/menus.test.cjs, tests/display.test.cjs, tests/sim.test.cjs, tests/dom-smoke.cjs, tests/october14.test.cjs, tests/october14-dom.cjs. Desktop-only: bennyshub/apps/games/games.json (this game's description), ELECTRON-SCAN-UPGRADE.md (this entry). Web-only: SCAN-UPGRADE-CHANGES.md (this entry). The owner's CHanges-October14 feedback file is retained verbatim. Desktop/web-specific layouts and entry scripts are preserved. The web game remains direct-link only.

Validation: 60 game checks pass, including 18,000 seeded games across four presets, five player counts and three CPU skills, plus 600 Hard/Easy matches (70% Hard wins). Eight focused Node DOM scenarios cover setup labels, four immediate-win flows, nested pass Back/confirmation, forced passes, save/resume, private handoffs, Auto and original saves. The 257 website tests and website build pass. No browser or Electron process was launched; real rendering, audible speech and physical switch checks remain for the target setup. Desktop source verification is recorded with the installation evidence. The owner subsequently authorized the website push on 2026-10-15, keeping Chasing Rainbows out of games.json and excluding the local CHanges-October14 feedback file from Git. .gitignore records that exclusion (WEB-ONLY). No desktop installer build is included. Optional printed-card play-along remains future work.

Backups, detailed logs and installation evidence: [local websites workspace]/tmp/chasingrainbows-october14-20261015/.


## Prediction row speech refresh — 2026-10-14

The owner requested this fix in both the desktop PC Hub and the F-drive website project. Selecting a predicted word could return to row mode before the asynchronous suggestions finished, leaving the old row speech playing after the buttons changed. Prediction rows now suppress their superseded label while refreshing and announce the newly rendered suggestions through the scanner's owned speech ticket if that row still has focus. Request versions reject late results; navigation away retains speech ownership. The shared scan controller, Companion package, input guards, parking and brake policy are unchanged.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/tools/keyboard/app.js | BOTH / PORTED | Refresh current word-row speech; desktop also covers its letter predictions. |
| bennyshub/apps/tools/journal/app.js | BOTH / PORTED | Announce the completed current prediction row and ignore older requests. |
| bennyshub/apps/tools/streaming/keyboard_integration.js | BOTH / PORTED | Refresh after selecting a suggestion; invalidate closed/older requests. |
| bennyshub/apps/tools/streaming/app.js | BOTH / PORTED | Own the refreshed row announcement and its speech wait. |
| bennyshub/apps/tools/phraseboard/board-choice.js | BOTH / PORTED | Stable suggestion-row identity, live labels in grid/free layouts, and parent restoration after redraw. |
| bennyshub/apps/tools/ytsearch/js/app.js | WEB-ONLY / NATIVE SEARCH SEPARATE | Version scheduled predictions and notify scanning after rendering. |
| bennyshub/apps/tools/ytsearch/js/scanning.js | WEB-ONLY / NATIVE SEARCH SEPARATE | Announce the current visible prediction row through the scan adapter. |
| Desktop: bennyshub/apps/tools/search/app.js | DESKTOP-ONLY / DONE | Refresh history/API prediction speech, reject outdated responses, and retain the prediction row during loading. |
| Desktop: bennyshub/apps/tools/messenger/keyboard.js | DESKTOP-ONLY / DONE | Refresh word, phrase and common-word speech; independent row request ownership and immediate completed-result announcements. |
| Desktop: bennyshub/apps/tools/rt-convo/index.html | DESKTOP-ONLY / DONE | Keep the selected word/phrase row during loading, reject stale results and announce current suggestions. |
| Desktop: tests/prediction-row-speech.cjs | BOTH VERIFIED / TEST IN DESKTOP | Real-page/component regression runner, including unchanged Music Maker behavior. |
| SCAN-UPGRADE-CHANGES.md | WEB DOCUMENTATION / NO PORT | Record this audit and validation. |

Validation: 35 targeted Electron browser/component checks passed across the eight desktop prediction surfaces and five website surfaces. These cover word/phrase/letter/common-word rows, delayed and out-of-order replies, navigation away, empty results, Phraseboard grid/free groups, and Auto Wait for Speech ownership plus a full interval. The untouched desktop Keyboard backup fails the new regression on its old row announcement. Existing desktop scan/adapter/prediction tests passed. All 257 website unit tests, the website build, 1,078 page/link checks, and the 2,015-file release audit passed. The seven built website JavaScript files match the reviewed source hashes. The test uses controlled prediction responses and speech completion tickets; physical switches and audible voice output were not tested. No website publication was performed.

Originals and reports: the desktop workspace's tmp/prediction-speech-20261014/ (before/desktop, before/web, report.json, baseline-report.json, web-manifest.json). The regression entry runs through tools/run-electron-test.cjs, which creates and disposes an absolute OS-temporary working directory. Music Maker already awaited predictions before its row return and required no change.

## SwitchedGames logo refresh — 2026-10-13

Use the owner-supplied connected-halves logo with larger button circles in both NARBE House links to SwitchedGames. New references use the new filename; the legacy image URL also serves the new artwork.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| index.html | WEB-ONLY / NO PORT | Point both SwitchedGames images to logos/switchedgames-logo.svg. |
| logos/switchedgames-logo.svg | WEB-ONLY / NO PORT | Add the exact supplied SVG. |
| logos/switchedgames_emblem_v5.svg | WEB-ONLY / NO PORT | Serve the new SVG at the legacy URL for existing consumers. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record scope and verification. |

Validation: the web build, 1,078 page/link checks, and public-file audit passed. Both logo references load the new SVG in Chromium; source, legacy, and built SVGs match the supplied file byte for byte. Full House layout verification is limited by blocked Tailwind/Lucide CDN access in the local browser. Original changed files are backed up in ../tmp/switchedgames-logo-20261013/before/narbehouse/. Related updates cover SwitchedGames and NARBE Foundation. The owner approved publication on 2026-10-13. No Electron port.

## Chasing Rainbows phone layout — 2026-10-13

The owner requested a mobile layout fix while keeping the working PC/tablet design. Phone widths up to 600px, plus short landscape viewports up to 960px wide and 500px high, now use a vertically scrolling game and menu overlay. Cards use a non-overlapping touch grid; seats, rainbow progress, choices, values and long labels wrap. Table piles size from width and played combos grow the felt instead of collapsing a size-contained table. Menus retain the chosen text size instead of shrinking to 60%; safe-area padding and dynamic viewport height accommodate phone browser chrome. Pause remains reachable, with scroll clearance beneath it. Highlighted choices and Look answers reveal themselves within the scrolling page. Existing scan identities, timing, gameplay and tablet/desktop CSS are retained.

Backup: [local websites workspace]/Website Backups/ChasingRainbows-before-mobile-2026-10-13. The owner authorized pushing this update for collaborator testing through the existing direct link. Chasing Rainbows remains absent from games.json, and no catalog image is added. The Hub game catalog, shared modules, desktop application and existing release archives are unchanged.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/CHASINGRAINBOWS/css/style.css | WEB-ONLY / NO PORT | Add the phone breakpoint, scrolling/safe-area layout, wrapping cards and controls, and readable menus. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/app.js | WEB-ONLY / NO PORT | Bypass whole-menu scaling on phones; reset new menu scroll, retain in-place settings scroll, and reveal scan choices/Look answers. |
| bennyshub/apps/games/CHASINGRAINBOWS/README-ACCESSIBLE.md | WEB-ONLY / NO PORT | Document the phone layout and automatic focus scrolling. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record the change and verification limits. |

Validation: all 46 existing game checks and 257 website checks passed. Node/jsdom navigation checks passed with desktop and phone layout flags: settings, menu resize transitions, in-place scroll retention, all five Look answers, row Back, row-title/dimmed-menu/pointer navigation, pause/settings/resume, and a six-player game at 150% text size including hand-card focus and row Back. JavaScript syntax and CSS parsing passed; the pre-existing CSS remains byte-for-byte unchanged before the appended phone rules. The web build, 1,017 page/link checks, and 1,937-file public audit passed. Built game CSS and JavaScript match source. Evidence: ../tmp/chasingrainbows-mobile/.

Visual layout, CSS media-query rendering, real touch, speech and switch hardware remain unverified. jsdom does not render layout; its phone flag exercises the app's responsive behavior only. No browser was launched on this PC, following the game's README. Device review should cover 320–430px portrait widths, short landscape, long settings/Look answers and six-player games at 150% text size.

## Chasing Rainbows Look navigation update — 2026-10-12

The owner requested publication of the latest local game update. Look answers now appear in a large-print callout and return focus to Look in the turn menu; mouse/touch can return through the row title or dimmed turn menu, and choosing a different row item retains its parent navigation. The game remains direct-link only, with the existing Hub manifest byte-for-byte unchanged. No shared module or Electron application is changed.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/CHASINGRAINBOWS/js/app.js | WEB-ONLY / NO PORT | Publish the supplied Look answer, row visibility and pointer-navigation changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/css/style.css | WEB-ONLY / NO PORT | Publish the supplied answer callout, emphasis and row-title styling. |
| bennyshub/apps/games/CHASINGRAINBOWS/README-ACCESSIBLE.md | WEB-ONLY / NO PORT | Document Look return behavior and mouse/touch navigation. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/dom-smoke.cjs | WEB-ONLY / NO PORT | Publish the supplied checks for visible Look choices, answer feedback and return navigation. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record the update and publication validation. |

Validation: all 46 game checks pass. A focused Node/jsdom check exercises all five Look answers, row Back, row-title Back, dimmed-menu Back, pointer selection of an unhighlighted Look item and pause/settings/resume, with no script errors. Build, 1,017 page/link checks and the 1,937-file public audit pass. The source and built game manifests match the original SHA-256 a6671526c2c89a8f1f47be2f0f3b1debc0c8463b9682ba4da8b0df174b71c2a8. Visual rendering, real speech and switch hardware were not exercised on this PC, per the game README. Focused check evidence: ../tmp/chasingrainbows-look-release/. Prior public version: c8ab8fda86fa201f9e4c01087b8a345d419dea7d.

## Chasing Rainbows creator review release — 2026-10-12

The owner explicitly requested publishing Chasing Rainbows for creator testing at a direct Benny's Hub link, without adding it to the manifest. The game remains absent from the Hub catalog and SwitchedGames listing. The game is publicly reachable at its direct URL; noindex/nofollow discourages indexing and is not access control. All creator credits and ownership restrictions remain intact. Original partner reference documents and artwork stay local. No desktop application or shared scan/speech module is changed.

Direct URL: https://narbehouse.github.io/bennyshub/apps/games/CHASINGRAINBOWS/index.html

Backup: [local websites workspace]/Website Backups/ChasingRainbows-before-web-2026-10-12. Baseline commit: 1a8433ca420ef20c704967d1ffa96239d3337819. The existing games.json remains byte-for-byte unchanged (SHA-256 a6671526c2c89a8f1f47be2f0f3b1debc0c8463b9682ba4da8b0df174b71c2a8).

| File | Scope / Electron status | Change |
| --- | --- | --- |
| .gitignore | WEB-ONLY / NO PORT | Exclude original partner reference documents and art from Git. |
| scripts/build.cjs | WEB-ONLY / NO PORT | Exclude the local REFERENCE DATA folder from the public build. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record the direct-link publication scope and checks. |
| bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md | WEB-ONLY / NO PORT | Retain creator ownership/reuse notices and record the authorized creator review release. |
| bennyshub/apps/games/CHASINGRAINBOWS/README-ACCESSIBLE.md | WEB-ONLY / NO PORT | Preserve the existing game and accessibility documentation. |
| bennyshub/apps/games/CHASINGRAINBOWS/README.md | WEB-ONLY / NO PORT | Preserve the existing game and accessibility documentation. |
| bennyshub/apps/games/CHASINGRAINBOWS/SPEC.md | WEB-ONLY / NO PORT | Retain the game design history and record the direct-link review authorization. |
| bennyshub/apps/games/CHASINGRAINBOWS/css/style.css | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/fonts/Nunito.ttf | WEB-ONLY / NO PORT | Ship the existing local font and its license. |
| bennyshub/apps/games/CHASINGRAINBOWS/fonts/OFL.txt | WEB-ONLY / NO PORT | Ship the existing local font and its license. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/back.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/blue.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/cloud.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/day.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/double.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/fog.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/green.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/indigo.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/night.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/orange.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/rain.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/red.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/storm.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/sun.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/violet.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/wild.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/wind.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/yellow.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/index.html | WEB-ONLY / NO PORT | Add the web entry, noindex/nofollow metadata, and omit the unavailable desktop electron bridge. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/ai.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/app.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/audio.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/cards.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/display.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/engine.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/fx.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/menus.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/narrator.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/sky.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/table.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/words.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/card.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/chime.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/fog.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/night.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note0.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note1.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note2.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note3.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note4.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note5.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note6.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note7.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/pop.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/puff.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/rain.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/shuffle.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/slam.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/sparkle.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/thunder.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/turn.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/whoosh.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/display.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/dom-smoke.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/menus.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/rules.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/sim.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/sky.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tools/make-card-art.py | WEB-ONLY / NO PORT | Preserve local asset-generation source; excluded from the public build. |
| bennyshub/apps/games/CHASINGRAINBOWS/tools/make-sounds.py | WEB-ONLY / NO PORT | Preserve local asset-generation source; excluded from the public build. |

Validation: 46 existing game checks and 257 website checks passed. The web build passed, 1,017 case-sensitive page/link checks passed, and the 1,937-file public release audit reported no problems or findings. The existing Companion ZIP hash remains unchanged. The focused switch-navigation integration run passed every menu, nested settings, pause, main-menu save/resume, Look/Back navigation and a complete game to results with no script errors. The remaining long-running scenarios were stopped after this coverage; the full seven-scenario suite was not completed. Browser rendering was not exercised on this development PC, per the game README.

## Legal-page publication authorized — 2026-10-10

The owner explicitly instructed "ok push" after reviewing the local privacy/terms work, superseding the earlier local-only restriction. Publish the current generic notices and confirmed LLC operator/privacy contact through the existing main-to-Pages workflows. Outstanding provider/form settings and legal applicability remain documented in the private review; approval does not verify them. No tracking/consent settings or game/scan/speech/Electron behavior is changed.

Resolve the build's license dependency by keeping the byte-identical released license in extension/LICENSE. Only the separate branding paragraph may differ from the current website LICENSE; any other license change fails packaging. Existing immutable destinations are verified and skipped instead of rewritten. The active Companion ZIP/version, runtime, permissions, setup references and checksums remain unchanged.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| extension/LICENSE | BUILD INPUT / WEB-ONLY / NO PORT | Exact reviewed Companion license snapshot, preserving the released package bytes. |
| scripts/companion-license.cjs | BUILD / WEB-ONLY / NO PORT | Permit only the separate branding paragraph to differ; fail other license changes. |
| scripts/package-companion.cjs | BUILD / WEB-ONLY / NO PORT | Use the validated snapshot; avoid rewriting already-verified immutable files. |
| tests/companion-license.test.cjs | TEST / WEB-ONLY / NO PORT | Cover branding-only changes, grant/disclaimer changes, malformed input and reviewed snapshot hash. |
| README.md, CHANGELOG.md, SCAN-UPGRADE-CHANGES.md | DOCUMENTATION / WEB-ONLY / NO PORT | Explain snapshot maintenance and record publication authorization. |
| ../SWITCHEDGAMES/CHANGELOG.md | DOCUMENTATION / WEB-ONLY / NO PORT | Record the owner's publication instruction. |

Pre-publication uncommitted files backed up and hash-verified outside the websites at [local websites workspace]/Website Backups/Legal-publication-2026-10-10-1791680815715. Its release baseline records 1,657 existing release/download files and timestamps. The original legal-page backup and fact table remain at [local websites workspace]/Website Backups/SwitchedGames-legal-2026-10-10-1791679705308.

Validation before push: 257 Node tests pass; build succeeds; 994 page/link checks pass; public release audit covers 1,881 files with no problems/findings. The active Companion ZIP matches the submitted SHA-256; all 1,657 pre-existing release/download files retain their bytes and timestamps. The 201 legal-page browser checks remain applicable to unchanged HTML/CSS.

## SwitchedGames privacy, terms and branding — 2026-10-10

Local review only. This request does not authorize publication, regardless of prior approvals recorded below. Preserve graphics/audio changes, game behavior, shared scan/speech code, Electron applications and existing release archives. No Electron port.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| index.html | WEB-ONLY / NO PORT | Add SwitchedGames names and a separate policy pointer outside the unchanged mirrored privacy text. |
| bennyshub/index.html | WEB-ONLY / NO PORT | Narrow SwitchedGames branding and third-party/contributor ownership clarification only. |
| crypto-statement/index.html | WEB-ONLY / NO PORT | Matching narrow branding clarification. |
| LICENSE | WEB-ONLY / NO PORT | Add SwitchedGames name variants in the separate branding note; preserve license grants. |
| README.md | WEB-ONLY / NO PORT | Matching SwitchedGames branding reference. |
| CHANGELOG.md | WEB-ONLY / NO PORT | Record the local legal/branding change. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record every changed source file and related-site scope. |
| ../SWITCHEDGAMES/privacy.html, terms.html, legal.css | WEB-ONLY / NO PORT | New readable static legal pages; no Analytics, fonts API, widget or automatic notice script. |
| ../SWITCHEDGAMES/index.html, aboutus.html, crypto-statement/index.html | WEB-ONLY / NO PORT | Add accessible Privacy Policy and Terms of Use footer links and align structured publisher metadata with the owner-confirmed LLC operator; existing integrations unchanged. |
| ../SWITCHEDGAMES/CHANGELOG.md | WEB-ONLY / NO PORT | Record related-site changes. |

Backup originals verified with SHA-256 before editing: [local websites workspace]/Website Backups/SwitchedGames-legal-2026-10-10-1791679705308. Review evidence, fact table, validation and publication blockers are outside the published trees in its review directory. Both working trees were clean at the recorded baseline.

Source-license branding is also bundled by scripts/package-companion.cjs into the immutable active Companion candidate. The build's byte-comparison guard must remain intact; no release ZIP, generated dist output, extension permission or shared privacy disclosure is edited by hand. See the external review report for the actual build result and required publication follow-up.

## Website publication approval — 2026-10-10

After local testing and the High/Low fidelity review, the owner explicitly approved pushing the website. Publish the complete web change through the existing main → GitHub Pages workflow. The shared manager, service-worker cache v39, all 13 web profiles and future-game framework requirements are included. Desktop source remains local; no desktop installer or Companion store submission is included. Deployment success must be confirmed from the Actions run and live site.

Publication-record changes: GRAPHICS-QUALITY.md, GRAPHICS-VALIDATION.md, GRAPHICS-DESKTOP-PARITY.md and SCAN-UPGRADE-CHANGES.md (DOCUMENTATION / NO RUNTIME PORT). Existing local validation remains 253 passing Node tests, a successful build, 978 clean page/link checks and a clean 1,879-file public audit.

## High/Low fidelity review — 2026-10-10

Owner-requested comparison against the verified pre-graphics source, especially NARBE Racer. Native Racer's fresh High menu and race match the original scene/material/light signatures, color pipeline, drawing-buffer dimensions and four-sample antialiasing. Switching from Auto/Low to High in an existing renderer retains its original no-MSAA context until the game is reopened; the setting's full-change-next-launch indication remains intentional and avoids restarting a round. High's geometry and art have not been reduced. Low reduces drawing-buffer size and disables launch MSAA without changing race geometry or gameplay.

One fidelity correction: Bowling's High mode now preserves its original uncapped display density. The shared default cap of 2 had reduced resolution on displays above 2×. Low retains the 921,600-pixel budget. The game registration is covered by a regression check at 1×, 1.5×, 2× and 3×, including Low-to-High restoration.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js | RENDERING / DESKTOP IMPLEMENTED | Preserve original display density on High; shared Low cap retained. |
| tests/graphics-quality.test.cjs | TEST / DESKTOP IMPLEMENTED | Exercise the real Bowling registration and High/Low density contract. |
| GRAPHICS-QUALITY.md | DOCUMENTATION / DESKTOP IMPLEMENTED | Record Bowling's original uncapped High resolution. |
| GRAPHICS-VALIDATION.md | VALIDATION / DESKTOP RESULTS REFERENCED | Current test totals and fidelity evidence. |
| bennyshub/service-worker.js | WEB CACHE / NO DESKTOP PORT | v39 invalidates the preceding local experiment cache. |
| SCAN-UPGRADE-CHANGES.md | WEB RECORD / NO RUNTIME PORT | Record this fidelity audit and exact scope. |

Desktop audit evidence and source checkpoints: tmp/graphics-quality-audit-20261010/. Its native rendering audit checks High → Low → High restoration, fresh Low MSAA, pixel budgets, shadows, Basketball reflections/bloom and P3GL post-processing across all 13 desktop Three.js games. Source inspection also confirms Baseball's High uses its original maximum 3× canvas scale. These checks establish rendering fidelity and reduced GPU work; low-end-device FPS remains a user acceptance check. Nothing pushed, deployed or packaged.


Validation completed: 13/13 native Three.js fidelity profiles pass with actual draws after each change; Racer menu/race comparisons pass; Bowling's 3×-display regression is reproduced and corrected (original/new High 2400×1800, prior High 1600×1200, Low 800×600 in an 800×600 CSS viewport). Racer original versus High race captures differ in only 29 pixels out of 1,890,672, by at most one channel value out of 255. Focused desktop Node checks: 31/31. Web Node checks: 253/253; local build, 978-page checks and 1,879-file release audit pass. Reports include all-games-report.json, racer-report.json, racer-race-report.json and bowling-density-report.json in the audit directory.

## Universal graphics: Auto, High, Standard, Low — 2026-10-10

The user clarified that the universal setting must exist in both desktop and web, then specified Auto, High, Standard and Low. That explicit request authorized the desktop work after the initial web-only phase. Both source trees are implemented locally; no push, deployment or installer build occurs before user testing.

Auto is the fresh default and measures each actual renderer's frames, reduces detail after sustained slow rendering, and cautiously retries higher detail with hysteresis/backoff. Manual High, Standard and Low and per-game inheritance are supported; existing Lightweight migrates to Low and explicit legacy High/Low to those named choices. Gameplay clocks, physics, input and speech are preserved. Shared runtime details and hardware limits are in GRAPHICS-QUALITY.md.

The web has 13 profiles; desktop has the same 13 plus its catalog-only Sphere Splash. Desktop uses production preload/IPC, isolated per-key persistence in userData and authoritative async startup for every renderer. Native differences were selectively retained. The table below records the original web file scope with its updated desktop disposition. Desktop-specific files and final test results are recorded in its ELECTRON-SCAN-UPGRADE.md. Four-mode verification supersedes the earlier 247-test/two-mode snapshot; current outcomes are in GRAPHICS-VALIDATION.md. Pi performance and user acceptance remain pending.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| AGENTS.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| GRAPHICS-DESKTOP-PARITY.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| GRAPHICS-QUALITY.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| GRAPHICS-VALIDATION.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| SCAN-UPGRADE-CHANGES.md | WEB RECORD / NO RUNTIME PORT | This file-level implementation and test record. |
| bennyshub/ACCESSIBILITY.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| bennyshub/apps/games/BENNYSBALLISTA/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBALLISTA/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSBALLISTA/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/BENNYSBASEBALL2/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBASEBALL2/js/game.js | SHARED RENDERING/SETTINGS / DESKTOP IMPLEMENTED | Display-density profile, canvas settings/status and pause layout; retain logical world/input coordinates. |
| bennyshub/apps/games/BENNYSBASEBALL2/js/rendering.js | SHARED RENDERING/SETTINGS / DESKTOP IMPLEMENTED | Display-density profile, canvas settings/status and pause layout; retain logical world/input coordinates. |
| bennyshub/apps/games/BENNYSBASEBALL2/js/scenes.js | SHARED RENDERING/SETTINGS / DESKTOP IMPLEMENTED | Display-density profile, canvas settings/status and pause layout; retain logical world/input coordinates. |
| bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/js/arena.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Simplify crowd heads/seats and freeze decorative motion only; preserve scoreboard and random sequence. |
| bennyshub/apps/games/BENNYSBOWLING/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js | SHARED RENDERING/SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Integrate graphics settings and rendering without gameplay/input retuning. |
| bennyshub/apps/games/BENNYSDICE/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSDICE/js/game.js | SHARED RENDERING/SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Integrate graphics settings and rendering without gameplay/input retuning. |
| bennyshub/apps/games/BENNYSFISHMYSTERY/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSFISHMYSTERY/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSFISHMYSTERY/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/BENNYSPEGGLE/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSPEGGLE/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSPEGGLE/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/BENNYSRACETRACKS/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSRACETRACKS/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSRACETRACKS/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/css/style.css | SHARED PRESENTATION / DESKTOP IMPLEMENTED | Wrap the graphics status inside the Animal Friends settings row. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/js/stage3d.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEKART/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEKART/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/NARBEKART/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEMINIGOLF/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEMINIGOLF/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/NARBEMINIGOLF/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEPICKLEBALL/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/game.js | SHARED RENDERING/SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Integrate graphics settings and rendering without gameplay/input retuning. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/ROBOTFOOTBALL/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/ROBOTFOOTBALL/js/renderer.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/ROBOTFOOTBALL/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/index.html | WEB HUB / DESKTOP HUNKS IMPLEMENTED | Accessible Graphics quality default, live value and stable settings scan ID. |
| bennyshub/service-worker.js | WEB ONLY / NO DESKTOP PORT | Version v38 and precache shared graphics resolver; retain named-asset network-first policy. |
| bennyshub/shared/graphics-quality.js | SHARED / DESKTOP IMPLEMENTED | Public resolver, device-local precedence, migration, caps, launch-only options and disposal. |
| bennyshub/shared/platform.js | PLATFORM-SPECIFIC / DESKTOP ADAPTATION IMPLEMENTED | Expose settings readiness/disposal and final-page close lifecycle; preserve storage/speech/input behavior. |
| developer-guide.html | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| scripts/check-graphics-exits.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-frames.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-gameplay.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-games.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-interactions.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-offline.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| tests/graphics-quality.test.cjs | WEB TEST / NATIVE SUITES ADDED | Thirteen shared-contract tests, including future-game and asynchronous adapter cases. |


## NARBE Racer: Wonder and Dream cups, set pieces, coin luck, item icons — 2026-10-10

User requested publishing the PC Hub NARBE Racer update to the website. Sixteen tracks in four cups: every track's big jump is now a full-width landscape gap (creek, canyon, moat, sea trench, tar pit, ball pit, city street, molten gear pit and more); the Wonder Cup (Jungle Falls, Floating Isles, Coral Reef, Dino Valley) and the new Dream Cup (Toy Room, Funfair, Neon City, Clockwork Factory) add loop-de-loops, steep berms, drive-through waterfalls and themed curtains (bubbles, steam, hologram, confetti), archway runs and sky islands, each with its own scenery set and theme song. Coins are now item luck: the coins a player holds at a Power Box pull the odds toward better items (more when further behind, reaching a jackpot band in last place) and are spent on the item; coin trails hop between two lanes. The HUD item slot and roulette use drawn, centred icons instead of platform emoji.

Controls, scanning, pause, menus and defaults are unchanged; every set piece is automatic. Website analytics, favicons and the scan-badge test page (`tools/ui_mock.html`) are preserved; the browser edition keeps no Electron bridge. Cups unlock in order (Sunshine, Moonlight, Wonder, Dream); Mirror keeps its original Sunshine + Moonlight condition, so saved progress is unaffected.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/NARBEKART/js/tracks.js, themes.js, world.js, spline.js, race.js, camera.js, items.js, constants.js, game.js, hud.js, ui.js, art-items.js, audio.js | SHARED / ALREADY DONE ON DESKTOP | Sixteen circuits and four cups; landscape gaps, loops, berms, curtains, archways, sky islands; coin luck and lane-hopping coin trails; six new songs; drawn HUD item icons. |
| bennyshub/apps/games/NARBEKART/js/props-gaps.js, props-wonder.js, props-wonder2.js, props-dream1.js, props-dream2.js, item-icons.js | SHARED ASSETS / ALREADY DONE ON DESKTOP | New procedural scenery, hazards, set pieces and item icons. |
| bennyshub/apps/games/NARBEKART/css/nk.css | SHARED / ALREADY DONE ON DESKTOP | Curtain wash variants and drawn-icon sizing. |
| bennyshub/apps/games/NARBEKART/index.html | SHARED / ALREADY DONE ON DESKTOP; WEB ENTRY ADAPTED | New script tags; retained website analytics and favicons, no Electron bridge. |
| bennyshub/apps/games/NARBEKART/DESIGN.md, readme.md | DOCUMENTATION / ALREADY DONE ON DESKTOP | Cups, set pieces, coins, catalog and load order. |
| bennyshub/apps/games/NARBEKART/tools/* (except ui_mock.html) | DEV TOOLS (not published) / ALREADY DONE ON DESKTOP | Track validator rules, set-piece race tests, Node scene renderer. |
| bennyshub/ACCESSIBILITY.md | WEB DOCUMENTATION / DESKTOP EQUIVALENT EXISTS | NARBE Racer row: automatic set pieces, gentle curtain wash, coin rules. |
| bennyshub/apps/games/games.json, index.html | WEB CATALOG / NOT NEEDED | Listing and homepage card mention the sixteen tracks. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | This sync record. |

Validation (Node only, no browser launched on this PC): all 16 circuits and their mirrors pass the track validator; 71 set-piece checks (full 12-kart races on every track in both rule sets and mirrored, loops, camera, coin trails); 21 race, 20 item/guidance/AI and 38-ramp jump-layout checks; audio check with every existing song and sound bit-identical; every script in the page resolves. Previous website files are backed up at `[local PC Hub workspace]/tmp/narberacer-web-sync-20261010/backup`.

## Battleboats presentation upgrade — 2026-10-08

User requested syncing the already-approved PC Hub Battleboats upgrade into the website game folder. Detailed SVG ships, shot/splash/explosion effects, five original WAV sounds, sunk-ship reveals, fleet/accuracy displays, reduced-motion and volume controls, scanned Pause and persistent results/replay are included. Automatic scenes wait for their owned speech ticket and a 650 ms trailing buffer; paused and abandoned turns cannot resume from stale callbacks.

Website analytics, favicons, existing pause-menu choices and highlight cleanup are preserved. The browser edition uses its existing shared managers and mobile audio unlocker, with no Electron bridge. No desktop files, shared managers, catalogs, existing thumbnail edits, release ZIPs or deployments are changed by this sync.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/BENNYSBATTLEBOATS/index.html | SHARED PRESENTATION / ALREADY DONE ON DESKTOP; WEB ENTRY ADAPTED | New interface and local assets; retained website metadata and browser integration. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/scripts/battleship.js | SHARED / ALREADY DONE ON DESKTOP | Reveal/shot lifecycle, pause/replay/settings, speech completion and trailing buffer; retained website-specific pause behavior. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/scripts/presentation.js | SHARED / ALREADY DONE ON DESKTOP | Ship artwork, stable fleet overlays, bounded effects, reports and SafeAudio. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/styles/command.css | SHARED / ALREADY DONE ON DESKTOP | Responsive naval presentation, effects and full mobile fleet reveal. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/scan-access.js | SHARED / ALREADY DONE ON DESKTOP | Pause/result scan choices and visible settings highlights. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/audio/hit.wav, launch.wav, miss.wav, sonar.wav, sunk.wav | SHARED ASSETS / ALREADY DONE ON DESKTOP | Original procedural sound effects. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/README.md | WEB DOCUMENTATION / DESKTOP EQUIVALENT EXISTS | Features, access controls and browser validation commands. |
| scripts/generate-battleboats-audio.cjs | WEB TOOL / DESKTOP EQUIVALENT EXISTS | Reproducible original audio generator. |
| scripts/check-battleboats.cjs | WEB TEST / DESKTOP EQUIVALENT EXISTS | Headless-browser adaptation of the complete regression fixture. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | This sync record. |

Validation: 51 real-browser assertions passed with the website shared modules, including both player modes, switch navigation, paused/abandoned shots, results/replay, reduced motion, five decoded WAVs, phone layouts and delayed speech tickets. All 17 local HTML asset references resolve. The service worker does not cache this game, so its cache version is unchanged. Previous website files are backed up at `[local PC Hub workspace]/tmp/battleboats-web-sync-20261008-uaBnaY/backup`.

## Robot Pickleball default speeds — 2026-10-07

User-requested defaults: Movement is Brisk (3.4), and Ball pace is Full speed (1). Missing or invalid settings use these defaults; valid saved choices remain intact. This scoped gameplay-default update applies to both the PC Hub and website.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/NARBEPICKLEBALL/js/game.js | SHARED / DONE ON DESKTOP | Brisk/Full speed initialization and matching invalid-value fallbacks. |
| bennyshub/apps/games/NARBEPICKLEBALL/README.md | SHARED DOCUMENTATION / DONE ON DESKTOP | Document both defaults and saved-preference behavior. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | Record this authorized defaults change. |

Validation: fresh/missing, malformed and invalid stored settings initialize to Brisk/Full speed; valid saved access choices remain unchanged. All 239 web Node tests and all 10 desktop Node control checks pass. Desktop and web game source match.

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

This public map replaces the chronological working ledger; its complete original, task notes, backups and test attempts remain preserved locally. Current policy is maintained in [ACCESSIBILITY.md](../../bennyshub/ACCESSIBILITY.md) and [the developer guide](../../developer-guide.html). See [validation](../../submission/VALIDATION.md) and [the test checklist](../testing/SWITCH-ACCESS-TESTING.md).

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
| `scripts/check-*.cjs`, `scripts/browser-check.cjs`, `scripts/player-layout-checks.cjs`, `scripts/release-assets.cjs` | WEB-ONLY | Retained browser/input/layout/release checks; [prerequisites](../../scripts/README.md). |
| `tests/*.test.cjs`, `tests/fixtures/scan-upgrade.html` | WEB-ONLY | Controller/adapter/speech/badge/app-boundary/package regression fixtures. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Current behavior contract. |
| `developer-guide.html` | SHARED / RE-PORT | Integration and native-mechanic guidance. |
| `README.md`, `CHANGELOG.md`, `AGENTS.md`, `SCAN-UPGRADE-TESTING.md`, `WEB-EXTENSION-MIGRATION.md`, `extension/README.md`, `submission/*.md` | WEB-ONLY | Release, privacy, validation and maintenance handoff. |

## Release and validation

Companion 1.0.7 is **101,050 bytes / 26 members**, SHA-256 `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`. Only its manifest version differs from accepted 1.0.6-blanket-access. Independent ZIP/CRC/unpacked checks, production scoping, shared parity and website-download parity passed. All 24 prior archive copies were unchanged.

The runtime baseline passed 142 unit tests; grouped-access settings passed 16 Edge UI groups. Version promotion passed three targeted existing package/shared-sync tests. All catalogue apps have recorded stationary-choice acceptance; focused later suites cover dotted feedback, the inline toolbar, independent speech and silent Parking Off. These overlapping fixtures are not exhaustive playthroughs. [Validation](../../submission/VALIDATION.md) records coverage and manual limits.

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


## 2026-10-13 — Pet Pals and Magic Button web catalog import

Owner-requested import from the existing OneDrive Benny's PC Hub into the F-drive web checkout. Copied all 76 game files and the two existing PNG thumbnails. The 74 non-entry files match the source by SHA-256. Both HTML entry points omit the desktop electron-bridge.js script and include the web usage analytics and favicon links. Shared web managers and game controls are unchanged. The original OneDrive/Electron app was only read; it was not edited, installed or launched. Electron port flag: NOT REQUIRED — source is already the desktop implementation.

Added the two original source entries to bennyshub/apps/games/games.json (28 games), added first-position New Game cards to the NARBE House index, and bumped the Hub cache from v39 to v40. The separate SwitchedGames checkout has the two thumbnails, matching cards and JSON data, updated 28-game/four-cause-and-effect counts, and a Simulation category for Pet Pals. Its existing search, favorites, details and launch URL conventions are retained.

Graphics assessment: Pet Pals is a fixed-design 2D pixel canvas with cached layers; Magic Button is a 2D canvas with existing resolution and particle/object bounds (including at most 3,400 sparks, 60 bubbles and 400 bubble particles). No new Three.js/WebGL renderer or graphics setting was introduced. Preserve the source's visual defaults and essential cause-and-effect feedback. These observations are not a performance guarantee; physical-switch and target-device/Raspberry Pi acceptance remain pending.

Validation: website build passed; the release audit found no problems in 2,014 public files; all 1,078 checked Pages links passed; 30 JavaScript syntax checks passed; four thumbnail copies and both manifest entries match OneDrive. All 38 browser checks passed with no runtime errors or missing required assets: blank menu safety, Space/Enter navigation, all three Magic Button scenes, settings, Pet Pals adoption and nested naming, pause, saved-pet reload, search/category filters, details and thumbnails, both homepage iframe launch buttons, and mobile viewport fit. Desktop and mobile renders were visually reviewed. Browser verification details are recorded in tmp/petpals-magicbutton-20261013/browser-report.json in the websites workspace. Pet Pals deliberately probes optional recordings/music and synthesizes absent sounds, as documented in sounds/SOUNDS.md; this is retained from the source. Prepared and verified locally first. The owner subsequently authorized publication with “go ahead”; publish the game assets on NARBE House before the SwitchedGames listings. All 257 tests required by the Pages release workflow pass.

Backup and copy evidence: websites workspace tmp/petpals-magicbutton-20261013/before and copy-verification.json. Prior release ZIPs were validated and retained by the existing build helper.

Changed web files (scope: this import; Electron flag: not required, desktop source unchanged):

- bennyshub/apps/games/games.json
- bennyshub/images/games/narbepetpals.png
- bennyshub/images/games/narbemagicbutton.png
- bennyshub/service-worker.js
- index.html
- SCAN-UPGRADE-CHANGES.md
- bennyshub/apps/games/NARBEPETPALS/css/style.css
- bennyshub/apps/games/NARBEPETPALS/index.html
- bennyshub/apps/games/NARBEPETPALS/js/anims.js
- bennyshub/apps/games/NARBEPETPALS/js/arrange.js
- bennyshub/apps/games/NARBEPETPALS/js/companions.js
- bennyshub/apps/games/NARBEPETPALS/js/core.js
- bennyshub/apps/games/NARBEPETPALS/js/game.js
- bennyshub/apps/games/NARBEPETPALS/js/howtodemo.js
- bennyshub/apps/games/NARBEPETPALS/js/music.js
- bennyshub/apps/games/NARBEPETPALS/js/mypets.js
- bennyshub/apps/games/NARBEPETPALS/js/outings.js
- bennyshub/apps/games/NARBEPETPALS/js/pets.js
- bennyshub/apps/games/NARBEPETPALS/js/petside.js
- bennyshub/apps/games/NARBEPETPALS/js/pixel.js
- bennyshub/apps/games/NARBEPETPALS/js/places.js
- bennyshub/apps/games/NARBEPETPALS/js/props.js
- bennyshub/apps/games/NARBEPETPALS/js/room.js
- bennyshub/apps/games/NARBEPETPALS/js/scan-access.js
- bennyshub/apps/games/NARBEPETPALS/js/scenes.js
- bennyshub/apps/games/NARBEPETPALS/js/school.js
- bennyshub/apps/games/NARBEPETPALS/js/seasons.js
- bennyshub/apps/games/NARBEPETPALS/js/sound.js
- bennyshub/apps/games/NARBEPETPALS/js/sprites.js
- bennyshub/apps/games/NARBEPETPALS/js/tricks.js
- bennyshub/apps/games/NARBEPETPALS/js/ui.js
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-1-puppy-kitten.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-2-teen.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-3-grown-up.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-4-senior.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-1-puppy-kitten.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-2-teen.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-3-grown-up.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-4-senior.png
- bennyshub/apps/games/NARBEPETPALS/previews/song-cozy-corner.wav
- bennyshub/apps/games/NARBEPETPALS/previews/song-garden-breeze.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-meow-sad.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-meow.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-purr-short.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-purr.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog bark.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog excited.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog friendly.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-adult.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-baby.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-adult.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-baby.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-senior.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-teen.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-adult.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-baby.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-senior.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-teen.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-senior.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-teen.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-pant.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-panting.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/long purr.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/meow.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/puppy bark.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/puppy excited.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/puppy happy.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/sad meow.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/short purr.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/SOUNDS.md
- bennyshub/apps/games/NARBEMAGICBUTTON/css/style.css
- bennyshub/apps/games/NARBEMAGICBUTTON/index.html
- bennyshub/apps/games/NARBEMAGICBUTTON/js/input.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/main.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/scenes.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/settings.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/sound.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/ui.js

Changed files in the separate SWITCHEDGAMES checkout (web listing only; Electron flag: not applicable):

- CHANGELOG.md
- index.html
- showcase.js
- images/games/narbepetpals.png
- images/games/narbemagicbutton.png


## 2026-10-14 — Auto starts at full High quality

Scope: requested graphics default correction for both the website and desktop Hub. Auto starts at High, preserves original antialiasing, and adjusts using measured game frame timing. Saved manual choices remain unchanged. The website service-worker cache advances from v40 to v41.

Changed website files (Electron port flag):

- bennyshub/shared/graphics-quality.js — YES, shared behavior applied to both editions.
- bennyshub/index.html — YES, matching explanation in each edition.
- tests/graphics-quality.test.cjs — YES, shared regression expectations and coverage.
- GRAPHICS-QUALITY.md — YES, matching contract and validation limits.
- scripts/check-graphics-games.cjs — desktop counterpart updated in tests/graphics-electron-rendering.cjs.
- scripts/check-graphics.cjs — web only, legacy Auto now resolves to High.
- developer-guide.html — web only, graphics integration contract.
- bennyshub/service-worker.js — web only, cache invalidation.
- SCAN-UPGRADE-CHANGES.md — web only, this change record.

Additional desktop test file: tests/graphics-auto-browser.cjs (can validate website sources using an optional staging overlay; uses a disposable OS-temp working directory). Existing desktop rendering test accepts BENNY_GRAPHICS_TEST_OUTPUT for isolated artifacts.

Validation: 25 desktop graphics/native unit checks and 16 website graphics unit checks passed. Real Chrome Auto/High equality and sustained slow-frame downshift passed in Ballista and P3GL at DPR 2. Basketball/Baseball were blocked by unavailable external THREE/Phaser assets. Electron's test GPU initialization crashed and raised the reported Windows breakpoint dialog; further GUI testing stopped. No target-device benchmark is claimed. Local source changes only; no publish or installer build.


## 2026-10-14 — Remove unreliable Auto; fixed High by default

Scope: user-authorized fallback for both Hub editions after Auto still selected Low. A deterministic reproduction showed a steady 30 FPS stream reaches Standard at about 4.0 seconds and Low at 7.6 seconds. Frame cadence alone does not establish device capacity. The previous start-at-High correction is superseded.

High, Standard and Low are the only graphics profiles. Games still offer Use Hub setting. Fresh/invalid settings default to High; saved shared Auto becomes High; explicit Standard/Low remain. High ignores Basketball's old automatic Low cache. The former shared frame sampler is a no-op compatibility hook.

Changed website files (Electron port flag):

- bennyshub/shared/graphics-quality.js — YES, fixed modes/default and Auto migration.
- bennyshub/index.html — YES, graphics explanation.
- bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html — YES, legacy default inherits Hub and obsolete Auto fallback removed.
- tests/graphics-quality.test.cjs — YES, migration, no downgrade, Basketball resolver and selector coverage.
- GRAPHICS-QUALITY.md — YES, current contract and validation.
- scripts/check-graphics-games.cjs — desktop equivalent updated in tests/graphics-electron-rendering.cjs.
- scripts/check-graphics.cjs — web-only assertions updated.
- developer-guide.html — web-only graphics contract.
- bennyshub/service-worker.js — web-only cache v42.
- SCAN-UPGRADE-CHANGES.md — web-only change record.

Additional desktop changes: bennyshub/shared/native-settings.cjs (default and durable Auto migration), tests/graphics-native.test.cjs, tests/graphics-electron.cjs, tests/graphics-electron-rendering.cjs and tests/graphics-auto-browser.cjs (web/browser integration harness, including actual Basketball Hub iframe and optional test-only CDN assets).

Validation on 2026-10-14: all 24 desktop graphics/native unit checks and 14 website graphics unit checks passed. Real Chrome checks passed for Basketball, Ballista, P3GL and Baseball at DPR 2. Checks covered saved Auto migration, inherited High, full launch antialiasing, 30/25/10 FPS synthetic cadences without downgrade, explicit Low and return to Hub. Basketball additionally passed actual Hub selector cycles and iframe Settings cycles, retained High after ten seconds, and had full post-processing and shadows. The screenshot confirms Use Hub setting (High). No Electron GUI process was launched in this follow-up.

Local source update only; no publication or installer build.


## 2026-10-16 — Robot Football yardage and Show n Sound SVG textures

Scope: requested whole-number yardage announcements and investigation/fix of shared images appearing as black boxes. The owner also explicitly requested the Robot Football fix in Benny's PC Hub. Field-goal distances, gains/losses and down-and-distance announcements round to the nearest whole yard; simulation precision and first-down decisions remain unchanged.

Show n Sound uses WebGL textures while Matchy Match uses HTML images. Eight viewBox-only SVGs decode as browser images but fail direct WebGL texImage2D upload with INVALID_VALUE (1281): Cardinal, Hibiscus, Cherry Blossom, Crab, Pufferfish, Police Car, Speedboat and Snowflake. Show n Sound now rasterizes SVGs to a canvas before texture upload, preserving aspect ratio and transparency. Shared artwork and Matchy Match are unchanged. Both file URLs and editor data URIs are supported.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/ROBOTFOOTBALL/js/ui.js — yardage presentation / YES, matching focused patch applied and verified in PC Hub.
- bennyshub/apps/games/ROBOTFOOTBALL/js/simulation.js — result narration only / YES, matching focused patch applied and verified in PC Hub.
- bennyshub/apps/games/BENNYSSHOWNSOUND/js/scenes.js — SVG decoding and texture creation / PENDING, website only in this task.
- SCAN-UPGRADE-CHANGES.md — this record / WEB ONLY.

Validation: all 265 panel images referenced by Show n Sound loaded and uploaded to WebGL without errors after the fix; the original audit reproduced exactly eight failures. Crab reveal and wheel screenshots inspected; embedded percent-encoded/base64 SVGs, query/hash URLs, non-square aspect ratio, transparency and failed-image fallback passed. Twelve home/away simulation checks verified rounded speech while preserving fractional stats and positions. Actual menu/scan/result speech passed in isolated Edge for web and staged PC Hub sources (the applied desktop files were then verified byte-for-byte), including 8.999999999, 6.4, 4.5, 48.9-yard field goals and positive/negative gains. No Electron GUI or installer build was run. The owner requested pushing the verified website fixes after validation. Game assets are outside the service worker's named cache; no cache revision needed.

Backup: [local websites workspace]/Website Backups/Football-yardage-show-sound-20261016-1792154986166
Evidence: artifacts/yardage-show-sound (image audits, browser speech results and screenshots).


## 2026-10-17 — RTC Lite website and reusable BYOK Worker

Scope: owner-requested RTC Lite addition to the web Tools catalog, its own screenshot, bio editing without a quiz, and the first app integration with a reusable Cloudflare BYOK service. The working desktop app was copied into this website and adapted to the web dictionary, shared scanner and separate Worker setup. The Electron source/runtime was not edited or launched.

Cloud keys are entered on the Worker origin, encrypted in per-browser SQLite Durable Object vaults and accessed through revocable app tokens. The Worker accepts only bounded RTC Lite operations with fixed provider endpoints/models. Keys and grants expire in 30 days. Request text is not persisted; request logging is disabled. Source is public-ready; encryption secrets, user keys and runtime state are excluded. Setup explains provider costs, Cloudflare/provider processing, same-origin token trust and deletion/retention limits.

The local speech picker offers Whisper, browser online speech and Off. The bio editor supports typing or the predictive keyboard. Dictionary fallback reads the existing web_keyboard_predictions.json without adding canned words. Local AI/server options remain. The service worker advances v42 to v43; large local runtimes cache only when used. Original bundled runtime files remain intact; the missing Apache TVM NOTICE/LICENSE are now included and manifest-hashed. Model downloads still follow upstream model revisions; no new application-level weight integrity guarantee is claimed.

Changed/added files (scope / Electron port flag):
- SCAN-UPGRADE-CHANGES.md — change record / NO, website only.
- bennyshub/apps/tools/rtc-lite/README.md — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/RTC-LITE-CONTEXT.md — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/THIRD-PARTY-NOTICES.txt — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/ai-generation.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/ai-worker.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/api-server.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/app.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/core.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/dictionary.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/index.html — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/providers.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/speech.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/APACHE-2.0-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/KOFFI-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/LOGLEVEL-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/ONNX-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/PARAKEET-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/SHERPA-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/TRANSFORMERS-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/TVM-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/TVM-NOTICE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/WEBLLM-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/WHISPER-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/manifest.json — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/ort-wasm-simd.wasm — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/ort-wasm.wasm — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/transformers.js — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/webllm.js — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/web-config.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/whisper-worker.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/tools.json — Tools catalog / NO, website only.
- bennyshub/images/tools/rtc-lite.png — RTC Lite app screenshot / NO, website only.
- bennyshub/service-worker.js — app shell cache and on-demand runtime cache / NO, website only.
- bennyshub/shared/byok-client.js — shared browser connection client / NO, website only.
- scripts/build.cjs — preserve suffix-named license/notice files / NO, website only.
- scripts/prepare-github.cjs — include Worker sources; exclude local state; scan TypeScript / NO, website only.
- workers/byok/README.md — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/package-lock.json — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/package.json — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/assets.d.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/rtc.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/setup-client.txt — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/setup.html — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/setup.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/util.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/vault.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/worker.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tests/browser.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tests/fixture.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tests/worker.test.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tools/initialize-vault.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tsconfig.json — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/worker-configuration.d.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/wrangler.jsonc — BYOK service, setup, deployment or verification / NO, website only.

Validation: all 257 existing website unit tests and five workerd BYOK integration cases passed. TypeScript and Wrangler dry build passed. Real Chrome tested first-party popup setup with third-party cookies blocked, key exclusion from app storage/requests, bio use, board context, prediction selection followed by changed suggestions, real dictionary loading, Space/Enter row navigation, Hub iframe launch/connect/exit, and keyboard fit at 1366×900, 1280×800, 1024×768 and 800×600. GUI launch used a disposable OS-temp working directory and cleaned only that runtime. Tests used synthetic provider responses; no real model quality, microphone or Surface performance result is claimed.

The Pages build, release audit (2,046 public files; no problems), link check (1,096 references; no issues), source credential scan and all 15 vendor-manifest checks passed. Prior Companion release ZIP checksums were preserved. Browser evidence is in artifacts/rtc-lite.

Deployment: bennys-hub-byok is live at https://bennys-hub-byok.narbehousellc.workers.dev. The encryption secret was generated in memory into Cloudflare, not saved locally. Live health, security headers, denied requests, preflight and a disposable synthetic-key vault/connect/delete round trip passed; that test vault was deleted and no upstream provider call was made. No other Worker was modified, no plan was changed, and the website changes have not been committed or pushed to GitHub.
