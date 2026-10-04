# Changelog

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
