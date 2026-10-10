# Graphics quality: local validation

2026-10-10. Web feature branch **feature/lightweight-graphics**, based on 846545118a240bf9066d07a1a0c96998839e65d1. The owner approved website publication after local testing on 2026-10-10. Desktop source was also implemented and tested after the user clarified the scope. Pi hardware acceptance remains pending.

## Reproduce locally

Run npm start (or node scripts/serve.cjs), then open http://127.0.0.1:4173/bennyshub/. Hub → Settings → Graphics quality sets the default. Open a supported game; its setting initially says Use Hub setting with the resolved value. Basketball and P3GL preserve old explicit High/Low selections until you deliberately change their graphics choice. Reopen when full change next launch appears.

Run these checks against that source server:

- npm test
- node scripts/check-graphics.cjs
- node scripts/check-graphics-games.cjs
- node scripts/check-graphics-gameplay.cjs
- node scripts/check-graphics-exits.cjs
- node scripts/check-graphics-frames.cjs
- node scripts/check-graphics-offline.cjs
- npm run build, then npm run check:pages and npm run audit:release

Browser scripts use the installed Google Chrome 154.0.8037.98 on Windows through Playwright with isolated contexts; no user profile is changed. They need the game's existing pinned external dependencies available, just as the game does. The gameplay runner reuses existing suites with Low seeded before game code, preserves their speech/controlled-clock fixtures and uses current targeted interaction checks where old suites described superseded gameplay. It does not replace simulation logic. No forced software-renderer flags are used, but these Windows/headless checks are not a GPU or Pi performance benchmark.

## High/Low fidelity follow-up

The desktop native audit passes all 13 Three.js profiles through High → Low → High and fresh Low, waiting for actual rendering after each change. Racer menu and race captures match the original graphics; switching from Auto/Low to High still needs reopening for MSAA. Bowling preserves original High display density above 2× after the correction; its actual registration is covered at 1×, 1.5×, 2× and 3× in both editions. Native 3× validation confirms original/new High 2400×1800 and Low 800×600 at an 800×600 CSS viewport. Desktop evidence: tmp/graphics-quality-audit-20261010/.

The same Bowling profile correction is applied in both editions, preserving their existing native startup and pause-menu differences; all 253 Node tests, the local build, page checks and release audit pass. The local cache is v39. Earlier browser/offline evidence below predates this narrow density correction. Sustained FPS on lower-end devices remains unmeasured.

## Results

- **253/253 Node tests passed**, including fourteen shared graphics-contract tests. Coverage includes an arbitrary future game ID, Hub changes, precedence/reset/reload, separate game keys, legacy migration, corrupt/blocked storage, pixel budget, renderer-next-launch indication, shadow restoration, disposal/BFcache and asynchronous native-adapter readiness using a fixture.
- **All 13 profiles passed real-browser launch/settings checks.** Basketball's representative suite runs first; the other twelve are in games-report.json. They verify Low before renderer creation, native Enter selection, stable menu context, cross-page Hub changes, override/reset, reload, Standard and High relaunches, real-frame Auto integration with deterministic slow-frame reductions, large resize and narrow settings. Graphics label text is checked for overflow, including the longer inheritance/relaunch notice. Screenshots were visually inspected; Fish Mystery and Animal Friends required scoped wrapping fixes. Baseball retains its pre-existing landscape canvas fit on narrow portrait screens.
- Basketball passed actual native aim/charge/released shot, live state preservation, pause/settings/Back/resume, old Auto/High/Low migration and **eight Standard/Low cycles**. Tracked renderer resources stabilized at **184 geometries / 31 textures** across those cycles; no monotonic growth in that check. This is not a guarantee against all GPU leaks.
- Native exits from **all 13 games** returned to the Hub and retained the preference. The offline shell cached the exact shared manager source hash and reloaded/changed the setting while offline. Embedded-Hub launch/update/override/reset/close/reopen results are in frame-report.json.
- Local build passed. The immutable existing Companion candidate retained SHA-256 4db777db1037e3ff9fd7469211ab385302cdebf25acb116cd73d433b0bbf3eab. The public release audit checked **1,879 files**, approximately **379.3 MB**, with **zero findings/problems**. Case-sensitive page/link checks covered **978 references**, with **zero issues**. The backup and private root documentation are excluded from the published tree. No publication command was run.

## Native desktop verification

- **101/101 focused Node tests passed**, including graphics contracts, native persistence/hydration/revision handling, scan/accessibility behavior and the ten real-game Pickleball control regressions.
- **14/14 profiles passed tests/graphics-electron.cjs** using Electron 40.4.1 / Chromium 144.0.7559.173: Hub and local settings cycle through the four modes with pointer/native Enter; child frames and separate managed windows synchronize overrides/reset; reload and full Electron restart preserve settings; Hub Back unloads each game.
- **14/14 profiles passed tests/graphics-electron-rendering.cjs**: Low launch and large-window pixel budgets; Standard/High launch antialias behavior; Auto receives actual render callbacks and responds immediately to sustained synthetic slow-frame samples. Basketball also exercises a released shot and state-preserving changes; Sphere Splash exercises a quick match, pause and narrow settings. No runtime page errors were recorded.
- The native fixture uses actual preload/bridge and production settings handler bodies with isolated temporary profiles. It does not launch the full external-service stack, alter the user profile or replace an installed packaged executable. Desktop source testing starts with start_hub.bat in Benny's PC Hub.

## Representative gameplay and access checks

The following deep gameplay checks were completed during the initial low-detail rollout (then named Lightweight); the final four-mode pass additionally reran Basketball gameplay and every supported renderer/settings integration.

These are sampled scenes/flows, not complete playthroughs of every level.

| Game | Local browser evidence |
| --- | --- |
| Basketball | Real shot, score/shot state preserved on change, pause settings/resume, migration and repeated renderer-resource checks. |
| Ballista | 31 assertion groups across stationary/nested surfaces; native easy/manual aim, hold charge/release fire, five/seven-second pause; parking/brake/owned speech; results and rare outcome surfaces use existing phase fixtures. |
| Bowling | 10 groups: three-player setup/ball selection, native position/aim/charge/released shot, pause/settings/Close/continue, game-over timing and scan policy. |
| Race Tracks | Cruise launch through current menus, native held steering/release, paused lane/state preserved across mode changes, resume. |
| Robot Football | Practice kickoff/play, native hold, pause/settings/Back/resume; simulation snapshot unchanged while switching paused graphics. |
| NARBE Pickleball | Current serve aim, serve release and held movement; pause/settings/Back/resume; serialized paused match state unchanged across graphics choices. |
| Dice | Add and physically throw a die, pause/settings/Back/continue; dice configuration and game mode retained. |
| P3GL | Real campaign scene and aiming, pre-shot scan order, recurring blank/parking/brake, existing native held pause. |
| Fish Mystery | 18 assertion groups: dock/world choices, pause/map/log/tackle contexts, nested Back identity, owned speech/parking/brake. Fishing campaign completion is not claimed. |
| NARBE Mini Golf | Course scene, native held aiming, Choose Power commits native putt, easy pause and scan ownership. |
| NARBE Racer | 11 groups: both players' racer/kart switch ownership, hold-to-preview/release selection, live one-switch steering, native held pause, approved pre-race pause-access notice. |
| Animal Friends | Barn launch and actual animal reveal, pause/settings/Back/continue; zone/start state retained through graphics changes. |
| Baseball 2 | 10 groups: team selection launches game; pitch grid, batting setup, frozen-pitch swing, throw targets, pause and result choices; existing scene fixtures stage uncommon surfaces. Settings and readable pause layout also inspected. |

## Measured rendering scope, not an FPS claim

At 1920×1080 CSS output with DPR 1, fresh Low Three.js buffers are at or below 921,600 pixels (usually 1280×720; Ballista's shorter canvas measured 1300×708). At 2560×1440 the same total pixel cap holds. Launch WebGL antialiasing was false. Standard restored the original resolution/antialias behavior; its adaptive logic can still lower resolution. Basketball's full-size 1× buffer becomes 55.6% fewer internal pixels at 1080p, alongside the documented shadow/reflection/bloom/crowd changes. This is reduced rendering work, **not a measured 55.6% FPS gain**.

Baseball's fresh Low buffer at 1920×1080 output measured 1800×1080, fitting its 5:3 canvas; Standard retains the previous rounded supersampling. Its settings/text canvas is not subjected to the Three.js 720p budget.

## Evidence and limits

Current four-mode reports are basketball-report.json, games-report.json, frame-report.json and offline-report.json; earlier deep gameplay/exit reports remain evidence for the original low-detail changes. Full native coverage reports are tmp/graphics-desktop-20261010/browser/coverage-report.json and rendering/coverage-report.json in the desktop tree; the ordinary report.json files may hold a later focused rerun. Auto uses deterministic frame samples to verify its decisions; these are not measured device FPS improvements.

Local reports are under artifacts/graphics/: basketball-report.json, games-report.json, exit-report.json, frame-report.json, offline-report.json; gameplay/shot-boundary-report.json, racer-owned-report.json, bowling-deep-report.json, phaser-deep-BENNYSBASEBALL2.json, interactions-report.json, ballista/browser-report.json and fish/browser-report.json. Individual earlier failure screenshots/reports remain as debugging evidence; launch-audit.json and the old animal-deep/rally reports predate fixes or use obsolete gameplay assertions and are superseded by the named final suites. Do not count a process exit alone as a passing legacy suite; inspect report result/errors.

No target-device frame-time percentiles or sustained FPS were measured. No audible speech quality, Bluetooth routing, cooling/throttling or AR-display latency claim is made. Some checks use owned speech-completion fixtures; the Pi test must include real output. Further full-game/multiplayer soak play and user visual/accessibility acceptance remain for the user. See GRAPHICS-QUALITY.md for the repeatable Pi procedure and GRAPHICS-DESKTOP-PARITY.md for the implemented native boundary.
