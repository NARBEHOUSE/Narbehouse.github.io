# Validation — web scan upgrade and Companion 1.0.8

Companion 1.0.8 is the prepared update for the Netflix-style video clipping defect. It has not been submitted to or approved by the store. On October 4, 2026, the owner previously reported 1.0.7 submitted/pending while 1.0.5 remained public; the publisher dashboard has not been independently checked. Website deployment and store approval are separate.

## Verified package

- Local package: `releases/1.0.8/bennys-hub-companion-1.0.8.zip`.
- **101,154 bytes; 26 members; SHA-256 `be4c9c670eedc01322ba7023e538046cd4db94f9593a6580a3eb44e4e9bfa544`.**
- Independent ZIP verification found exactly two changed members from 1.0.7: `player-view.js` and the version field in `manifest.json`. All 24 other members, including permissions, provider adapters and shared scan assets, are unchanged. Local/central ZIP headers, CRCs, unpacked parity and download parity pass.
- Production content scripts target `https://narbehouse.github.io/bennyshub/*`; developer origins and local testing controls are removed. Workspace `extension/` supports local preview.
- The submitted 1.0.7 ZIP remains 101,050 bytes, SHA-256 `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`.

The current checksum is maintained in [COMPANION-SHA256SUMS.txt](COMPANION-SHA256SUMS.txt). Package verification evidence is retained locally under `artifacts/companion-1.0.8`. The frame fix reproduced quarter-video clipping before the change and passed 15 controlled transform checks afterward. The five loaded-extension provider layout fixtures and 11 player-adapter/return checks also passed; evidence is under `artifacts/netflix-frame-fix`. Signed-in Netflix remains a user acceptance check.

## Automated coverage

All paths in the evidence column are **local-only maintainer records**, excluded from Git and public deployment. They are plain paths intentionally; a fresh checkout reproduces tests rather than containing screenshots, browser profiles or old archives. Group counts overlap and must not be added into a claim of complete gameplay coverage.

| Area | Accepted result | Local evidence |
| --- | --- | --- |
| Companion 1.0.8 release | 145 unit checks; 15 focused transform checks; five provider layout fixtures; 1,179 public files audited; 905 link references; exact ZIP checksum | `artifacts/companion-1.0.8/`; `artifacts/netflix-frame-fix/` |
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
- Check current public Companion 1.0.5 and production 1.0.8 separately. Source review finds the same protocol 1/capabilities/actions and no minimum-version gate;1.0.5 ignores additional scan preferences and retains older toolbar behavior. This is source compatibility, not a live store-profile test.
- Native browser permission approval prompts were mocked in options tests. Approve/revoke access in a real extension profile; confirm incomplete access and separate Calendar behavior.
- Verify actual switches, installed voices, speech quality, focus/OS dialogs, intended Chrome/Edge/PWA modes, and signed-in live providers. CDN/provider fixtures and mock media cannot prove current Netflix/Disney/Plex layouts, all paid-service controls or provider-specific resume/next behavior.
- Test optional news/calendar with a test account; no personal feed URL or credentials belong in public evidence.

No Electron files were changed or tested. The complete future plan remains locked at the end of [the implementation record](../SCAN-UPGRADE-CHANGES.md). Follow [the manual checklist](../SCAN-UPGRADE-TESTING.md) and [script prerequisites](../scripts/README.md). Website checks do not authorize an Electron port.
