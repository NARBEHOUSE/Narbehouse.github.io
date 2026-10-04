# Release maintenance — Benny's Hub Companion 1.0.7

The owner reports that 1.0.7 has been submitted for store review and remains pending, with 1.0.5 currently public. This is the owner's report, not an independent publisher-dashboard verification. Use the [existing Chrome listing](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc) for updates; no Edge Add-ons listing URL has been supplied. Website deployment and store approval are separate.

The current immutable package promotes the tested blanket-access runtime; only its manifest version changed. [Validation](VALIDATION.md) describes acceptance and remaining live/manual checks. [The implementation map](../SCAN-UPGRADE-CHANGES.md) records web changes and the locked Electron plan.

## Current files

| Local path | Purpose |
| --- | --- |
| `releases/1.0.7/bennys-hub-companion-1.0.7.zip` | Submitted production-origin package: 101,050 bytes, 26 members. |
| `releases/1.0.7/extension/` | Exact unpacked production candidate for isolated HTTPS testing. |
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

Omit `--check` from the package command only when intentionally preparing a new immutable candidate. If canonical helpers were intentionally changed, run the sync script without `--check` before packaging. No revision suffix is needed for 1.0.7. Do not replace an already submitted version with changed runtime bytes. Legacy Python full-kit/source-handoff commands are not part of this release path.

## Website publication

With GitHub Pages configured for Actions, a push to `main` runs `.github/workflows/pages.yml` and publishes only the verified `dist/` artifact. A failed build leaves the previous deployment in place. Check the actual Actions run; a local edit/commit does not establish deployment success. A website push does not submit or approve the extension.

Production Hub: https://narbehouse.github.io/bennyshub/. Preserve the `bennyshub/` directory beneath the Pages artifact root; do not nest an extra `dist/`. `.nojekyll` is generated. The PWA scope is `/bennyshub/`; localhost browser data does not migrate automatically to this HTTPS origin.

After deployment, check refreshed/offline assets, the package checksum, Companion connection, a public YouTube launch/return and the new settings with both current store 1.0.5 and isolated production 1.0.7. Source compatibility exists at protocol 1; old Companion controls retain their previous behavior until the update arrives. Live compatibility still needs that smoke check.

## Store follow-up and manual acceptance

The owner has already reported submission; do not assume another upload is required. Confirm the dashboard's actual status before any follow-up action. Keep reviewer URLs reachable and update submitted reviewer information if the dashboard permits and the deployed instructions differ. Approval and timing remain the store's decision.

Test signed-in providers, particularly Plex Resume, YouTube playlist actions and Disney+ next episode, as well as physical switches, installed voices and intended Chrome/Edge/PWA modes. Native permission prompts and OS UI require manual review. Calendar/news checks should use test data. Browser fixtures do not certify every provider's current UI. See [review steps](REVIEWER-INSTRUCTIONS.md) and [privacy reference](PERMISSIONS-AND-PRIVACY.md).

## Private data and preserved work

The public Streaming library starts empty (`data.json=[]`, `episodes.json={}`); the public Journal has no entries. Existing user browser data is retained locally. Day Hub has no personal calendar or default place, and RT-Convo is not shipped. Exclude local evidence, browser profiles, `TO BE ADDED/`, dependencies, credentials and backup trees from publication. Keep worker secrets in the configured secret store. Removing a current file does not erase Git history or revoke a previously disclosed secret.

Electron remains a separate, locked task. The web release does not copy files into the desktop app or authorize its launch or modification.
