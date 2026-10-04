# Development checks

## CI-safe checks

The Pages workflow uses Node.js 22.16.0 and runs:

```text
npm ci
npm test
npm run build
npm run audit:release
npm run check:pages
```

Unit tests use committed source/fixtures and do not require a browser or old local archives. Build/package commands use Node built-ins, verify canonical shared-copy parity and produce only the current setup-linked Companion download. CI checks its checksum against `submission/COMPANION-SHA256SUMS.txt`. Keep scoped Git byte-preservation attributes; the submitted ZIP must reproduce exactly.

## Browser checks

Start the local preview with `npm start` (port 4173). The `check-*.cjs` runners exercise actual pages and, where applicable, isolated extension copies/profiles. Many scan suites default to installed Microsoft Edge on Windows; some accept `EDGE_PATH`, `HUB_TEST_ORIGIN` or `HUB_TEST_ARTIFACTS`. Inspect the runner's options before using another browser/path: these overrides are not universal. Install the matching Playwright browser only for runners that use its bundled browser.

Run headed keyboard/focus/fullscreen suites one at a time. Concurrent headed windows can steal native focus and invalidate timing checks. Runners use temporary profiles rather than the owner's everyday browser. Production extension copies connect to HTTPS; local preview uses workspace development scoping or an explicitly isolated test copy.

Examples:

```text
node scripts/check-options.cjs
node scripts/check-companion-scan.cjs
node scripts/check-hub-scan-settings.cjs
node scripts/check-ballista-scan.cjs
```

`check-options.cjs` runs real options DOM/modules/CSS/keyboard in headless Edge with controlled Chrome permission/storage APIs. It does not automate the native permission approval dialog. Provider fixtures and synthetic media likewise do not establish signed-in service acceptance.

## Local engine fixtures

Some preserved game runners route exact production CDN engine versions to downloaded local fixtures. These files are intentionally absent from source and generated reports are ignored:

| Runners | Required local fixture folder |
| --- | --- |
| `check-scan-classic-action.cjs`, `check-scan-classic-smoke.cjs`, `check-scan-classic-visual.cjs` | `artifacts/scan-completion-classic/dependencies/`; exact Three/Cannon/OBJLoader URL-to-filename mapping is in each runner. |
| `check-scan-sports-phaser.cjs`, `check-scan-sports-phaser-deep.cjs`, `check-scan-sports-outline-only.cjs` | `artifacts/scan-completion-sports/fixtures/phaser-3.60.0.min.js`; use the exact Phaser 3.60.0 production CDN asset. |

Obtain those exact files from the URLs already named in the runner before running the affected suite; do not silently substitute engine versions. Native production CDN URLs remain unchanged. These optional browser suites are not invoked by Pages CI. A missing local fixture is a setup failure, not evidence that an app failed.

## Local evidence and historical utilities

Reports, screenshots, downloaded engines, browser profiles and release archives remain under ignored local folders. `SCAN-UPGRADE-CHANGES.md` and `submission/VALIDATION.md` summarize accepted coverage and distinguish fixture boundaries from real gameplay/provider checks. The one-time historical archive/backup audit remains workstation-only because it requires preserved external backups and older ZIPs. Do not copy those trees into the repository to make that audit portable.

Legacy full-kit or release-artwork scripts may target historical output paths. Review their input/output contract before use; they are not necessary for the current immutable package and website build. Tests/helpers are WEB-ONLY; equivalent scenarios must later be rerun through real Electron adapters after explicit authorization.
