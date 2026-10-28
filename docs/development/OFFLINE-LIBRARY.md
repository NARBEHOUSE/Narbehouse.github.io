# Offline library and personal sorting

This is the maintained web contract for future games and tools. Electron remains a separate, explicitly authorized pass.

## What is automatic

`npm run build` copies the reviewed public files to `dist/` and generates `dist/bennyshub/offline-manifest.json`. Each entry contains its scope-relative URL, byte size and SHA-256 revision. New game pages, modules, nested levels, images, fonts and bundled audio/video beneath `bennyshub/` are included automatically when they pass `scripts/public-files.cjs` and `scripts/offline-manifest.cjs`.

Do not add individual games to the service worker's `SHELL` list. That list is only the small installation/startup shell. The complete library is driven by the generated manifest. New file formats must be allowed by the public build predicate before they can ship or be cached. Never place runtime files in excluded authoring, reference, private, test or build-tool folders.

The PWA starts the complete download after `appinstalled`, on an installed standalone launch, or when the user chooses Download all games & tools. Browsers that do not emit installation events start it on the first installed launch. Existing users can download without reinstalling. Ordinary browser visits do not automatically download the entire library unless that device previously requested it.

Keep the app open online until Ready offline appears. Closing/suspending it can interrupt browser work; reopening online or choosing Resume reuses files with matching revisions. On later online launches, changed files download automatically. A complete saved library stays usable when the update check has no connection. Storage permission is requested on a best-effort basis; browsers can still evict data or users can clear it, so readiness is checked against cached files, not only a saved success flag.

Saved static files must be served from cache before contacting the network. Phone network changes can leave requests pending instead of rejecting them; never gate a cached game iframe on network failure. The current shell takes priority over older full-library copies and refreshes in the background. Manifest update checks, including response-body parsing, have a five-second deadline. An existing controlling worker initializes offline readiness without waiting for a registration/update request. Keep the URL lookup associated with the manifest that produced it so an earlier empty read cannot hide a newly downloaded library.

## Rules for new games

1. Keep every dependency needed for normal play local: engines, imports/import maps, workers, CSS/fonts, models, textures, levels and bundled media. Include the exact pinned version and licenses/provenance for third-party code. Use `shared/offline-vendor/` for shared dependencies and preserve recorded vendor bytes with `.gitattributes`.
2. Add the game/tool and thumbnail to the normal catalog with a stable unique ID and a local path. Catalog entries do not need their own cache configuration.
3. Keep private APIs, authenticated data, user-provided URLs and streaming outside the static inventory. Never cache arbitrary requests to make an online integration appear offline-capable. Optional AI runtimes/models and downloaded speech voices retain their separate download/cache flows.
4. Clearly identify inherently online features, such as streaming, live feeds, cloud AI and Trivia's YouTube rewards. Built-in game play must not require these to start. OS/browser speech availability also depends on the device's installed voices.
5. Run a cold offline test: use a fresh browser context, download from the Hub without opening the game, wait for Ready offline, disconnect, reload the Hub, then launch from its actual Hub card and play inside the embedded frame. Test immediate network failure and a connection that accepts requests but never responds, plus worker restart and upgrade with an existing download. Check visible game/keyboard content, not just an iframe element or top-level URL. Exercise dynamically loaded content, not just the title screen. Test the actual target devices before claiming device acceptance.

The dependency regression tests reject remote game page scripts/styles and check the pinned vendor files and font closure. They are a guard, not a full detector of dynamically constructed URLs: inspect new network calls and run the browser check.

## Development and validation

After editing source, run:

```text
node scripts/offline-manifest.cjs
npm start
node scripts/check-hub-offline.cjs
node scripts/check-hub-offline-navigation.cjs
node scripts/check-hub-library.cjs
```

The source manifest exists for the local preview. Regenerate it after source changes; a stale digest intentionally pauses downloads rather than claiming an inconsistent file is ready. Production builds always regenerate from the final copied files, including any deployment line-ending conversions. Commit the source manifest with source updates, but do not hand-edit its asset entries.

`check-hub-offline-navigation.cjs` uses an explicitly limited manifest fixture with the real Hub, Benny Says and Keyboard to cover embedded navigation, network stalls, restarted workers and upgrading the frozen published v63 worker. This focused regression complements the full-library check; mobile viewport/user-agent emulation is not physical-device or native PWA installation acceptance.

Normal release checks remain `npm test`, `npm run build`, `npm run audit:release` and `npm run check:pages`. The offline tests cover interrupted/repeated downloads, changed revisions, cache eviction, offline restarts, directory/query aliases, media ranges, quota failures and private/API exclusions. Bump the small shell cache version when changing shell installation/worker behavior; a new game needs no cache-version edit.

## Recently used and most played

`shared/hub-library.js` stores local opening counts and last-open timestamps through `NarbePlatform.settings`, separately from analytics. The Hub records an opening after its existing access gate succeeds. Sort choices are independent for Games and Tools; genre filtering and sorting happen before pagination. Most played/Most used means number of openings, with recency and then title as tie breakers; Recently used means latest opening first. Unused items follow alphabetically.

Use stable catalog IDs when renaming/reorganizing an app so its history survives. New catalog entries work automatically. History starts with this feature, stays on that browser/device, and is not imported from the PC Hub or old analytics. Reset restores all genres and alphabetical order without erasing usage history. Maintain the existing switch-accessible Sort toggle, reverse cycling and focus identity.
