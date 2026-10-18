# Release maintenance — Benny's Hub Companion 1.1.0

Companion 1.1.0 is a test candidate, not a submitted or approved update. On October 18, 2026, the owner reported installed version 1.0.8 and version 1.0.9 pending Chrome Web Store approval. That status is the owner's report; the publisher dashboard was not accessed. The submitted 1.0.9 archive is unchanged. Use the [existing Chrome listing](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc) for updates. Website deployment and store approval are separate.

Version 1.1.0 fixes Plex Previous/Next activation while the switch toolbar holds focus, with no new permissions. Netflix handlers and the 1.0.9 communication/storage features remain unchanged. The related website update fixes false playback-save conflicts and adds confirmed progress, search-history and watch-history clearing. [Validation](VALIDATION.md) records checks and live acceptance still pending. [The implementation map](../docs/history/DEVELOPMENT-HISTORY.md) records every changed file; this pass does not edit or launch Electron.

## Current files

| Local path | Purpose |
| --- | --- |
| `releases/1.1.0/bennys-hub-companion-1.1.0.zip` | Current production-origin candidate, 30 members; not submitted or approved. |
| `releases/1.1.0/extension/` | Exact unpacked production candidate for isolated HTTPS testing. |
| `submission/COMPANION-SHA256SUMS.txt` | Tracked expected archive checksum used by CI. |
| `extension/` | Workspace extension for local preview; not the production-origin package. |
| `dist/` | Generated public website; Pages uploads its contents only. |
| `submission/STORE-LISTING.md`, `REVIEWER-INSTRUCTIONS.md`, `PERMISSIONS-AND-PRIVACY.md` | Maintained listing/reviewer/privacy reference text. |

Release trees, ZIPs, screenshots, logs and browser profiles are generated/local files, not public source. Every prior archive and external Website Backups snapshot remains preserved. The old artwork kit is historical; verify images against the current UI before reusing them.

## Reproduce the website build

Use Node.js 22.16.0, matching the workflow. Scoped Git attributes preserve the submitted extension bytes, including existing line endings; do not normalize package files during release preparation.

```text
npm ci
npm test
npm run build
npm run audit:release
npm run check:pages
```

The build checks canonical Companion shared assets, regenerates the exact setup-linked production ZIP and includes only that ZIP in `dist/bennyshub/downloads/`. It refuses to overwrite a differing existing release artifact. CI compares the output to the tracked checksum before publishing. The Pages workflow also runs unit tests, public-file audit and link checks. Browser suites have additional prerequisites in [scripts/README.md](../scripts/README.md).

For extension-only work:

```text
node scripts/sync-companion-shared.cjs --check
node scripts/package-companion.cjs --check
```

Omit `--check` from the package command only when intentionally preparing a new immutable candidate. If canonical helpers were intentionally changed, run the sync script without `--check` before packaging. The 1.1.0 version preserves all earlier 1.0.8 candidates and original archives. Do not replace an already submitted version with changed runtime bytes. Legacy Python full-kit/source-handoff commands are not part of this release path.

## Website publication

With GitHub Pages configured for Actions, a push to `main` runs `.github/workflows/pages.yml` and publishes only the verified `dist/` artifact. A failed build leaves the previous deployment in place. Check the actual Actions run; a local edit/commit does not establish deployment success. A website push does not submit or approve the extension.

Production Hub: https://narbehouse.github.io/bennyshub/. Preserve the `bennyshub/` directory beneath the Pages artifact root; do not nest an extra `dist/`. `.nojekyll` is generated. The PWA scope is `/bennyshub/`; localhost browser data does not migrate automatically to this HTTPS origin.

After deployment, check refreshed/offline assets, the package checksum, Companion connection, a public YouTube launch/return and the new settings with the actual current store version and isolated production 1.1.0. Protocol 1 remains; old Companion controls retain their previous behavior until the update arrives. Storage is negotiated using `journal-storage-v1` and `app-storage-v1`, so an older 1.0.8 package does not falsely claim storage support. Until a storage-capable Companion connects, existing browser-storage behavior remains available. Live compatibility still needs that smoke check.

## Store follow-up and manual acceptance

The owner reports 1.0.9 pending review. The prepared 1.1.0 package has not been submitted; a website push does not upload it to a store. Confirm the dashboard's actual status before any store action. Keep reviewer URLs aligned with the deployed website. Approval and timing remain the store's decision.

With synthetic records, verify automatic migration, draft recovery, clear-site-data recovery, normal extension-update persistence, exports/restores and intentional clearing. Test signed-in providers, particularly Netflix picture framing after resize/fullscreen, Plex Resume, YouTube playlist actions and Disney+ next episode, as well as physical switches, installed voices and intended Chrome/Edge/PWA modes. Native permission prompts and OS UI require manual review. Calendar/news checks should use test data. Browser fixtures do not certify every provider's current UI. See [review steps](REVIEWER-INSTRUCTIONS.md) and [privacy reference](PERMISSIONS-AND-PRIVACY.md).

## Private data and preserved work

The public Streaming library starts empty (`data.json=[]`, `episodes.json={}`); the public Journal has no entries. Existing user browser data is retained locally. Day Hub has no personal calendar or default place, and RT-Convo is not shipped. Exclude local evidence, browser profiles, `TO BE ADDED/`, dependencies, credentials and backup trees from publication. Keep worker secrets in the configured secret store. Removing a current file does not erase Git history or revoke a previously disclosed secret.

The owner separately authorized the Electron port on October 17. It is implemented and tested in the desktop workspace, including the Python Help/Suction bridge, and is not part of this website repository. Desktop source backups and test evidence remain local.
