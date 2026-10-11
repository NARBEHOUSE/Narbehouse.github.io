# Changelog

## 2026-10-10 — Approved legal-page publication and reproducible packaging (WEB-ONLY)

- Owner authorized pushing the reviewed changes. Provider/form-setting and legal-applicability follow-ups remain recorded; no tracking settings change.
- Keep the released Companion license in extension/LICENSE and validate that only website branding differs. Preserve all existing archive bytes and timestamps during builds.
- Add scripts/companion-license.cjs and focused regression tests; update scripts/package-companion.cjs and maintenance documentation. No release revision, runtime or permission change.
- Validation: 257 passing Node tests, successful build, 994 clean page/link checks, clean 1,881-file release audit and unchanged submitted Companion checksum.

## 2026-10-10 — SwitchedGames legal pages and branding (WEB-ONLY)

- Add SwitchedGames, Switched Games and SwitchedGames.org to the maintained branding notices in index.html, bennyshub/index.html and crypto-statement/index.html, with a narrow third-party/contributor-rights clarification.
- Add separate SwitchedGames privacy/terms links before the root page's mirrored Hub/Companion privacy text; that shared text is unchanged.
- Update only the branding note in LICENSE and corresponding README.md branding reference. License grants are unchanged.
- Record the exact scope in SCAN-UPGRADE-CHANGES.md. No deployment, Electron pass, extension runtime change or release-archive change.
- Review evidence and verified originals: F:/PROJECT FILES/WEBSITES/Website Backups/SwitchedGames-legal-2026-10-10-1791679705308.
- Root LICENSE is an input to immutable Companion packaging; build validation and any resulting release-workflow blocker are recorded in the external review report.

## 2026-10-04 — Companion 1.0.7

- Promote the locally tested 1.0.6-blanket-access package to manifest version 1.0.7; packaged runtime files are unchanged apart from the manifest version.
- Keep the single Streaming and news switch, supported-platform list, separate Calendar setup, compact video frame, independent toolbar speech, and silent Parking Off behavior.
- Scan pause uses only a dotted outline; no Paused text is added. Parked feedback remains available when parking is enabled.
- Update the active setup download, release instructions and store-copy version to 1.0.7. Preserve every earlier release and website backup.
- The user reports the local changes are working well. The package is prepared locally; no store submission or website deployment is part of this version update.

## Historical — 2026-10-03 web scan upgrade / Companion 1.0.6 candidate

- Adds recurring blank stops, chosen or automatic loop parking, Space braking, and owned speech waits to stationary choice menus across the web Hub, games, tools and Companion.
- Keeps the new preferences centralized in Hub Settings, using the existing page scroll and visible disabled controls when Auto is Off.
- Preserves selected settings and parent rows through redraws and nested returns. Paused appears on the selected choice with a dashed outline; Parked clears choices and remains visible.
- Keeps native gameplay and multiplayer controls. Adds the approved Racer pause-access notice; hold-based gameplay alternatives remain internal future work.
- Keeps Companion controls in one compact row outside the video, with narrow-window scrolling and fullscreen support.
- Preserves prior website backups and all earlier release candidates. The candidate at that stage was 1.0.6-web-complete; nothing has been deployed or submitted. Electron remains locked.

See [the test guide](SCAN-UPGRADE-TESTING.md), [validation](submission/VALIDATION.md), and [the per-file/per-app record](SCAN-UPGRADE-CHANGES.md).
