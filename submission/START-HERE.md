# Release preparation — Benny's Hub Companion 1.0.5

The [Chrome Web Store listing is live](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc). Use that existing listing for future Chrome updates. Edge Add-ons submissions remain separate; no Edge listing URL has been supplied.

The packaging tools prepare this kit locally and do not push or submit to stores. The repository workflow automatically checks and deploys website changes pushed to main. Confirm each update's status in the store dashboard; rebuilding this kit does not establish approval. Target website: https://narbehouse.github.io/bennyshub/. Support: narbehousellc@gmail.com.

## Files to use

| File | Destination |
| --- | --- |
| bennys-hub-companion-1.0.5.zip | Upload this same ZIP to Chrome Web Store and Microsoft Edge Add-ons. Its root contains manifest.json. |
| assets/icon128.png | Chrome store icon. |
| assets/logo300.png | Edge listing logo. |
| assets/promo440x280.png | Small promotional tile. |
| assets/promo1400x560.png | Optional large/marquee tile. |
| assets/01-player-controls.png through 05-journal.png | Store screenshots; all 1280 × 800. |
| submission/STORE-LISTING.md | Name, descriptions, contact, category and search terms. |
| submission/PERMISSIONS-AND-PRIVACY.md | Single purpose, permission reasons, data-use disclosures and remote-code answer. |
| submission/REVIEWER-INSTRUCTIONS.md | Test instructions to paste into the reviewers' notes. |
| website-github-pages.zip | Separate website artifact, alongside this kit. Do not upload it to an extension store. |
| SHA256SUMS.txt and release-audit.json | Package checksums and automated public-file scan. |

## Before public submission

1. Review the actual ZIP and copy, using the `extension/` folder beside the ZIP for local unpacked testing. The store build only connects to the production Hub origin. The workspace's original `extension/` folder remains suitable for localhost development.
2. Test the release on the deployed HTTPS site once you decide to publish the website. The current production URL may still serve an older site; preparation does not update it. The packaged website and privacy URL must be publicly reachable for review.
3. Perform signed-in playback checks on each service you intend to advertise, especially Plex Resume, YouTube playlist navigation and Disney+ next episode. Automated provider fixtures do not prove every paid service's current UI. If a service fails, fix it or remove its advertised support and optional permissions before submission.
4. Check real one-/two-switch input in desktop Chrome and Edge, plus your intended PWA mode. Browser-level UI such as the address bar and permission dialogs cannot be forcibly controlled by an ordinary extension. Alt+Shift+B deliberately releases the player controls for sign-in.
5. Test an optional calendar and news feed using a test account; never put a private calendar URL or credentials in reviewer notes. No subscription account is needed for the basic YouTube review path.
6. Review the privacy declarations and publisher account identity. The supplied privacy page describes the actual local and third-party data flows; local-only processing still needs disclosure.
7. Use the existing Chrome publisher account and listing for updates. Set up and verify a Microsoft Edge publisher account in Partner Center if submitting to Edge Add-ons.
8. Upload the extension ZIP to the appropriate existing listing, update copy/disclosures or images when needed, and submit the update. Store acceptance and timing are controlled by Google/Microsoft.
9. The public setup page links to the Chrome Web Store and explains installation and connection. Developer ZIP instructions remain collapsed. See `PREVIEW-DISTRIBUTION.md`. Add an Edge Add-ons link only after its listing is available. A website button opens the store's install flow; it cannot silently install an extension.

## GitHub Pages preparation

The site uses static HTML/CSS/JS, browser storage and an optional companion. TMDB metadata uses the separately deployed Cloudflare Worker; no Node server or Python helper runs on Pages. The Worker already allows https://narbehouse.github.io. Keep its TMDB secret in Cloudflare.

Publish the **contents of dist/** at the root of the `narbehouse.github.io` repository's Pages artifact, preserving the `bennyshub/` subdirectory. Do not put the artifact inside another `dist/` directory and do not deploy this whole workspace. The PWA scope is `/bennyshub/`. Website storage is origin-specific: localhost data is not automatically copied to GitHub Pages.

The deployment workflow is included at `.github/workflows/pages.yml`; `pages.yml.example` is a reference copy. With Settings > Pages > Source set to GitHub Actions, each push to `main` automatically runs **Publish reviewed website**. It publishes only the built `dist/` artifact after tests, the public-file audit and link checks pass. Failed build checks leave the live site unchanged. The commit receives GitHub Actions checks; open the check indicator or Actions tab for results. A manual Run workflow option remains available for retries. This does not submit or update an extension store listing.

`.nojekyll` is included in the website artifact so static filenames are served without Jekyll processing. The automated public-file audit also checks the Pages size target and large individual files. It is not a full accessibility or security certification.

## Blank slate and private files

- Public Streaming starts with `data.json = []` and `episodes.json = {}`. The staging copy has also been cleared. Existing browser-local libraries remain on that user's device; Hub Settings → My data can clear them.
- The public journal has no saved entries; Day Hub has no personal calendar or default location. No RT-Convo app is shipped.
- Catalog backups and browser-test profiles remain under the ignored `artifacts/` directory, outside all release artifacts. Do not upload that directory, `TO BE ADDED/`, worker dependencies/secrets, or this whole experimental workspace to a public repository.
- The Electron journal in Ben's separate software folder was styled earlier, but its personal entries and library are not included in these packages.
- If a secret ever existed in a previously published repository, deleting a current file does not remove Git history or revoke it. This local preparation has not rewritten any remote history.
- Public company branding and intended publisher/support contact details remain. Automated scanning cannot prove that every image, free-text passage or imported historical file has no personal information.

## Rebuild locally

```
npm ci
npm test
npm run build
npm run audit:release
npm run check:pages
npm run prepare:github
npm run package:release
node scripts/release-assets.cjs
npm run package:release
```

The asset script performs isolated browser checks and makes screenshots. The second packaging pass adds those assets and the updated review documents to the kit. `npm run build` and `npm run package:release` need Python 3; assets need Playwright Chromium. Development checks use `npm start` and `HUB_TEST_ORIGIN=http://127.0.0.1:4173`.

Official references: [GitHub Pages workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Chrome publishing](https://developer.chrome.com/docs/webstore/publish), [Edge publishing](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).
