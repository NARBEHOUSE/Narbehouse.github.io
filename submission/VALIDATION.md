# Validation — web scan upgrade and Companion 1.0.8

Companion 1.0.8 is the prepared update for the Netflix-style video clipping defect and Companion-managed app storage. The current candidate uses the `keyboard-wrap` filename revision while keeping manifest version 1.0.8. It has not been submitted to or approved by the store. On October 4, 2026, the owner previously reported 1.0.7 submitted/pending while 1.0.5 remained public; the publisher dashboard has not been independently checked. Website deployment and store approval are separate.

## Current keyboard compatibility candidate

Current package: `releases/1.0.8-keyboard-wrap/bennys-hub-companion-1.0.8-keyboard-wrap.zip`.

- **112,120 bytes; 29 members; SHA-256 `4db777db1037e3ff9fd7469211ab385302cdebf25acb116cd73d433b0bbf3eab`.**
- The canonical shared scanner adds an opt-in keyboard-row wrap. Companion playback groups retain their default behavior. Manifest version, permissions, storage and provider code are unchanged from the journal-storage candidate.
- All 206 unit tests pass. Thirteen actual-renderer checks pass across five web and eight desktop keyboard surfaces, including repeated held reverse scans, forward wrapping, Auto, brake, native return routes and key selection. Native services are isolated in these tests. Evidence: `artifacts/keyboard-row-wrap/report.json`.
- The v33 service worker refreshes the offline shell for this deployment. Earlier archives remain immutable.

## Preserved app-storage candidate

Current package: `releases/1.0.8-journal-storage/bennys-hub-companion-1.0.8-journal-storage.zip`.

- **112,004 bytes; 29 members; SHA-256 `d8822dcb55df204d55af00b33206a0ac9cd809e561fde4170d2d4a8fb7a66c25`.**
- Manifest remains 1.0.8 and is byte-equivalent in meaning to the original 1.0.8 manifest, with unchanged required and optional permissions.
- Independent Python ZIP verification confirms CRCs, unpacked/download parity and exactly three added runtime files: `journal-store.mjs`, `app-data-store.mjs`, and `shared/data-backup.js`. Only `background.mjs` and `hub-content.js` changed among the original 26 members; the other 24 remain identical.
- Both historical archives below retain their original hashes. Evidence: `artifacts/journal-companion-storage/release/package-verification.json`.
- The current download checksum is enforced by [COMPANION-SHA256SUMS.txt](COMPANION-SHA256SUMS.txt). Eight backup validation groups and 15 Streaming unit groups pass, including actual app-reader compatibility, stale-editor restore protection and launch-progress persistence. Full release/browser checks are recorded separately against final source.

## App-storage acceptance

- All 203 unit tests pass, including storage failure/conflict handling, migration receipts, backup validation, stale editor protection the offline archive-restore safeguard, stale browser-fallback clear confirmations and merged-entry bounds.
- Seven groups pass with the real unpacked Companion in isolated Edge: all four legacy migrations; Journal entry and draft writes plus the main-menu blank stop; actual app writes; recovery after website storage clearing; four downloaded export/clear/restore cycles preserving unrelated apps; browser restart recovery; and delayed Journal startup without lost navigation. No page errors or unexpected dialogs/file pickers were recorded.
- Five Journal scan groups pass against final source, including blank loops, chosen/automatic parking, brake feedback and nested keyboard/calendar/dialog behavior. The accelerated-clock harness now waits for real Companion replies before advancing, avoiding spurious connection timeouts. Evidence: `artifacts/scan-completion-tools/journal.json`.
- Fifteen caregiver UI groups pass, with desktop/mobile screenshots checked for the existing layout and ordinary page scrolling.
- The real v32 service worker serves all three storage helpers offline with exact source hashes. My data loads offline with all four exports available; uncached requests fail as expected and no page errors were recorded.
- Backups containing preserved migration archives require the storage-capable Companion to be connected for restore. A disconnected attempt fails before changing values, pending writes or archives; ordinary backups without archives can still restore into browser storage.
- The final public build contains 1,182 files; the release audit and all 920 link checks pass.
- Local evidence: `artifacts/journal-companion-storage/real-companion-storage-report.json`, `data-settings-ui-report.json`, `offline-storage-helpers-report.json`, and `release/unit-final-review.tap`.

## Preserved original 1.0.8 package

- Local package: `releases/1.0.8/bennys-hub-companion-1.0.8.zip`.
- **101,154 bytes; 26 members; SHA-256 `be4c9c670eedc01322ba7023e538046cd4db94f9593a6580a3eb44e4e9bfa544`.**
- Independent ZIP verification found exactly two changed members from 1.0.7: `player-view.js` and the version field in `manifest.json`. All 24 other members, including permissions, provider adapters and shared scan assets, are unchanged. Local/central ZIP headers, CRCs, unpacked parity and download parity pass.
- Production content scripts target `https://narbehouse.github.io/bennyshub/*`; developer origins and local testing controls are removed. Workspace `extension/` supports local preview.
- The submitted 1.0.7 ZIP remains 101,050 bytes, SHA-256 `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`.

The historical original candidate checksum above remains a preservation check; the current revised candidate checksum is maintained in [COMPANION-SHA256SUMS.txt](COMPANION-SHA256SUMS.txt). Package verification evidence is retained locally under `artifacts/companion-1.0.8`. The frame fix reproduced quarter-video clipping before the change and passed 15 controlled transform checks afterward. The five loaded-extension provider layout fixtures and 11 player-adapter/return checks also passed; evidence is under `artifacts/netflix-frame-fix`. Signed-in Netflix remains a user acceptance check.

## Automated coverage

All paths in the evidence column are **local-only maintainer records**, excluded from Git and public deployment. They are plain paths intentionally; a fresh checkout reproduces tests rather than containing screenshots, browser profiles or old archives. Group counts overlap and must not be added into a claim of complete gameplay coverage.

| Area | Accepted result | Local evidence |
| --- | --- | --- |
| Original Companion 1.0.8 frame-fix release | 145 unit checks; 15 focused transform checks; five provider layout fixtures; 1,179 public files audited; 905 link references; exact ZIP checksum | `artifacts/companion-1.0.8/`; `artifacts/netflix-frame-fix/` |
| Full runtime unit baseline | 142 passed, zero failed | `artifacts/companion-blanket-access/unit-tests.tap` |
| All web apps | 26 catalogue games, six tools, legacy Mini Golf, Hub and Companion; per-app stationary menus and native exclusions recorded | `artifacts/scan-web-complete/completion.json`; [implementation map](../SCAN-UPGRADE-CHANGES.md) |
| Classic games | 13 apps, 116 surface-category records; held input and mobile checks | `artifacts/scan-completion-classic/final-ledger.json`; later `artifacts/quiet-parking-off/shared/final-ledger.json` |
| Sports/complex games | 12 app paths including legacy Mini Golf; root/nested menus, native multiplayer ownership, pause/shot boundaries and outcomes | `artifacts/scan-completion-sports/completion.json` |
| Six tools | 33 groups, zero page errors; nested rows, calendars, predictions, media and connection gates | `artifacts/scan-completion-tools/completion.json` |
| Final Ballista/Fish speech-policy regression | 31 / 18 groups, zero page errors | `artifacts/quiet-loop-final/ballista/browser-report.json`; `fish/browser-report.json` under the same root |
| Hub Settings / menus | 17 / 14 groups, zero page errors | `artifacts/quiet-loop-final/settings/browser-report.json`; `menus/hub-report.json` |
| Hub layout | 6 groups, 129 geometries; desktop/mobile/short and Default/Largest | `artifacts/hub-scan-visibility/final-ledger.json` |
| Connection gates | 6 groups across Day Hub, Journal and Streaming | `artifacts/quiet-loop-final/gate/gate-report.json` |
| Dotted-only pause feedback | Hub 3, Settings 16, Ballista 9, Fish 17, classic 19, sports 35, tools 12; zero recorded page errors | `artifacts/scan-outline-only/completion.json` |
| Companion framing/inline layout | Five provider fixtures, 29 snapshots; later final feedback 12 snapshots | `artifacts/player-layout-inline/browser-report.json`; `artifacts/scan-outline-only/companion/browser-report-youtube.json` |
| Independent toolbar speech | 6 groups, Help regression and 12 layout snapshots; persistence/cross-window/Hub independence | `artifacts/companion-toolbar-speech/completion.json` |
| Final Companion quiet-loop policy | 5 groups, exact final helper copy, zero page errors | `artifacts/companion-quiet-loop-final/browser-report.json` |
| Single access switch | 16 actual Edge UI groups: full/partial grants/removal, failures, live permissions/news, Calendar isolation, persistence, busy guards, keyboard and responsive layout | `artifacts/companion-master-access/browser-report.json` |
| Real offline shell | 2 groups, v 28 exact shared assets | `artifacts/quiet-loop-final/offline/offline-report.json` |
| Pre-publication 1.0.7 website build | 1,179 public files; 905 references; no link/audit issues; source/build parity | `artifacts/companion-1.0.7/build-parity.json`; `release-audit.json` |

The whole-app baseline is followed by targeted tests for each subsequent change. Older screenshots with a Paused label/dashed border are historical: current feedback is dotted outline only. The original reports and corrected fixture attempts remain in local snapshots; this public summary does not relabel them as current screenshots.

## What the checks establish

The accepted choice contract includes fresh/recurring blank stops in both directions, no blank Enter activation, chosen and 1–3-loop parking, brake tap/hold/full-interval resume, owned speech waits, mode changes while held, stable setting identities and parent restoration. Hub Settings uses ordinary page scrolling and visible-disabled controls. Current Companion controls reserve video/caption space, preserve native Unlock/Return/fullscreen behavior, and keep speech preference independent of Hub voice and media mute.

Native aim/charge/steering, moving/timed receivers, CPU/physics/animation, busy narration and existing pause holds remain explicitly outside choice scanning. Tests exercise those boundaries; they do not play every match to completion. Rare results, rounds, tactical states and nested menus sometimes use existing scene/method fixtures. Racer multiplayer checks use both mapped inputs, not a real two-person hardware session. Editor and native file-picker flows remain native behind scanned entry warnings.

## Remaining manual and live checks

- Check the deployed HTTPS Hub after the authorized website push, including refreshed service-worker assets, the downloadable 1.0.8 checksum and Return to Hub. Remote deployment has not been established by these local records.
- Check current public Companion 1.0.5 and production 1.0.8 separately. Protocol 1 remains, but app persistence is capability-gated: `journal-storage-v1` and `app-storage-v1`. Older versions (including the original 1.0.8 frame-fix package) retain website-local app data until the new capability connects; version text alone is not used to claim support. 1.0.5 also ignores additional scan preferences and retains older toolbar behavior. This is source compatibility, not a live store-profile test.
- Native browser permission approval prompts were mocked in options tests. Approve/revoke access in a real extension profile; confirm incomplete access and separate Calendar behavior.
- Verify actual switches, installed voices, speech quality, focus/OS dialogs, intended Chrome/Edge/PWA modes, and signed-in live providers. CDN/provider fixtures and mock media cannot prove current Netflix/Disney/Plex layouts, all paid-service controls or provider-specific resume/next behavior.
- Test optional news/calendar with a test account; no personal feed URL or credentials belong in public evidence.

The earlier blanket scan validation did not change or test Electron. The owner subsequently authorized a scoped keyboard repair: eight desktop keyboard renderers were tested and their source files updated, as recorded in [the implementation record](../SCAN-UPGRADE-CHANGES.md). The live desktop process and physical switches were not exercised. Follow [the manual checklist](../SCAN-UPGRADE-TESTING.md) and [script prerequisites](../scripts/README.md). Website checks do not authorize an Electron port.
