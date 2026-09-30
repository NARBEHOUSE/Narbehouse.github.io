> Public installation: [Chrome Web Store](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc). For updates and separate Edge submissions, see [submission/START-HERE.md](submission/START-HERE.md).

# Benny's Hub web experiment — implemented build

The three new applications now live under **Tools**. The apps retain their original interfaces; the migration changes native persistence and playback connections to browser storage and the companion. Provider compatibility remains experimental.

## Try it locally

1. Run npm install once, then npm start from this folder.
2. Open http://127.0.0.1:4173/bennyshub/index.html in desktop Chrome or Edge.
3. Open chrome://extensions or edge://extensions, enable Developer mode, choose Load unpacked, and select this project's extension folder.
4. Reload the Hub. The three new Tools cards appear after the companion responds.
5. At the top of the Hub, open **Companion & data → Companion settings** to open the installed extension's settings directly. Enable the streaming services you use. Use **Companion setup** for installation and connection help, **Check connection** to retry detection, and **My data** to export or clear saved Hub data, even without the extension. The public Streaming catalog starts empty; users add or import their own titles. Accounts and API credentials are not bundled.
6. Open Streaming: its original Recently Watched, Browse All, Shows, Movies, Search, Settings and Exit menu is restored. Use **Settings → Open Editor** for the original full editor, metadata lookup and genre images.

The local preview server and Load unpacked instructions above are for development only. Public users install through the Chrome Web Store and refresh the deployed Hub in the same browser profile. They need no Node, Python, Electron or local helper. Future extension updates still require store submission and review.

## What changed

- Manifest V3 companion with origin-validated, versioned request/response messages. The worker checks actual extension sender identity, approved Hub paths and managed-tab ownership.
- Live capability checks on load, focus, visibility, every five visible seconds, and before streaming launches. Missing or incompatible companions hide the three new cards; existing tools/games remain available. No saved installed=true flag.
- **Companion & data** is collapsed at the top, outside the switch scan sequence. Connection checks, direct Companion settings, setup help and data management live there. A reconnect screen preserves open work, provides Back to Hub, and keeps technical detail inside a settings disclosure.
- Streaming is adapted directly from TO BE ADDED/streaming: original HTML, CSS, scanning, search/prediction keyboard, genre grids, title details, season/episode navigation and full TMDB editor. Its public data.json is an empty array. Browser storage keeps user-added titles, edits, search history and recent/resume links. Import/export accepts original library and episode JSON. The supplied episodes.json is currently empty. HTML template values are escaped. TMDB lookup can use the separate workers/tmdb Cloudflare Worker, with its shared credential in a server secret. Set the public Worker URL in metadata-config.js after deployment. Until configured, a personal key can be entered only for the current editor tab; no key is saved or bundled.
- Streaming opens a dedicated popup window, requested fullscreen, with the control bar centered at the bottom. Space and Enter belong to the bar while switch controls are active, including when the page tries to focus an input or embedded frame. All controls are visible and color coded; Return to Hub is last; there is no switch-pause button. Alt+Shift+B temporarily allows sign-in/typing and returns control to the bar when pressed again. An extension cannot intercept keys in browser chrome or another application.
- The bar reads the Hub scan manager and voice settings and follows live changes. In two-switch mode, Space advances, a three-second Space hold repeatedly scans backward at the selected interval until released, and Enter selects. In one-switch mode, the bar starts in an unselected dead zone. Enter begins one loop; another Enter selects and parks, or the completed loop parks automatically. No parking button is needed.
- Automatic startup adapters preserve the original service-specific intent: Plex Play/Resume activation (including links and dialogs), Pluto unmute, and provider play/resume controls. Startup begins immediately, reacts to page changes and uses a short polling fallback. It handles empty/pending media without blocking Resume and limits retries. Direct control activation replaces the original native X/Enter/P sequence; synthetic Enter cannot activate a native button. The dedicated window supplies fullscreen rather than an OS-level F key. Autoplay restrictions can still require selecting Play. Startup stops on sign-in screens and does not click purchase controls. Real-provider acceptance testing remains necessary.
- Return to Hub uses a content-script handshake rather than relying on permission to read the Hub tab URL. It returns to the original Hub, or reopens its previously verified address if that tab is gone. Only Hub-launched player windows get controls.
- Journal stores entries and learned predictions locally. Reloading no longer replaces saved entries with entries.json. Removed its stale native voice shim and broken scan callback. Imported text is displayed literally.
- Day Hub starts without a location. Weather uses Open-Meteo only after configuration; news uses selected, fixed feed endpoints through the extension. Google Calendar iCal details are stored in extension-owned settings and parsed with bundled ical.js, including recurrence, exceptions, all-day dates and supplied timezone definitions. Missing timezone definitions produce an error rather than incorrect UTC appointments.
- RT Convo has been removed from the published Hub. Its source is archived under the excluded TO BE ADDED folder. The companion no longer exposes AI requests, AI settings, or AI-provider host permissions, and clears its old session credential. Removed-app data can still be exported/cleared in My data if it exists.
- My data provides per-app exports and scoped reset; journal imports append validated entries. No blanket localStorage.clear() is used.
- Added installable PWA manifest, original PNG icons and a service worker that caches only an explicit list of public static files. Personal API responses, transcripts, calendar feeds and streaming media are never cached there. Only empty public catalog templates are included among the static assets.
- Removed analytics from the Hub entry page. Public marketing pages were not redesigned or comprehensively audited.
- Added a public build in dist/. Staging sources, the extension, dependencies, tests, browser profiles and private runtime folders are excluded.

## Permissions and privacy

The companion requests streaming access per service, and calendar/news access only when enabled in its own settings. It does not request browsing history, cookies, debugger, native messaging or all-sites permissions. The bridge does not accept arbitrary scripts, arbitrary fetch URLs or arbitrary tab IDs.

Keyboard predictions use the original local dictionary, contextual word pairs/triples and learned vocabulary. No model worker, API, microphone, server or credential is used. Learned data stays in the existing browser storage; the keyboard works offline after the PWA assets are cached.

The release preparation clears the website and staging streaming libraries and episode catalogs, keeps the public journal empty, and excludes development artifacts and RT-Convo from deployment. Private catalog backups remain only under ignored artifacts/. This does not revoke old credentials, clear users' browser storage, or erase older OneDrive copies or remote history. Public company branding and the approved support contact remain.

Do not deploy the entire working directory. Run npm run build and publish the reviewed dist folder. Never save personal exports inside the website tree. The browser test profiles in artifacts contain synthetic test data only and are excluded from deployment and Git.

Run npm run test:keyboard to check typing, suggestion selection, repeated-word prevention, learned vocabulary and offline PWA reload. The retired KenLM experiment is excluded from public builds.

The TMDB Worker is ready to deploy but needs Cloudflare login, a secret and its deployed URL. See workers/tmdb/README.md.

## Validation

Run npm run test:streaming against the IDE preview on port 3000 (or set HUB_TEST_ORIGIN). It checks the empty initial catalog and an isolated synthetic library, original navigation and switch input, search/history, editor save/reload and safe rendering, mocked TMDB lookup, season/episode selection and recent progress. Unit tests include managed-player resume ownership and reset behavior, plus provider startup and autoplay-denial handling.

Run npm test for syntax, URL-policy, library import, calendar, player adapter and worker authorization tests. Run npm run test:player against port 3000 for dedicated-window launch, exclusive switch focus, held-Space repeat/release, live scan settings, one-switch loop/parking, and Return without a Hub host permission. This uses a synthetic Plex page, not a signed-in account. Run npm run test:exits for the three embedded apps returning to Tools.

With npm start running, run npm run test:browser. This launches an isolated Chromium profile and copies the production extension into an ignored test folder. The test manifest pre-grants only localhost for the synthetic video fixture; production streaming permissions remain optional. Tests do not use real accounts.

Browser checks cover absent/present companion gating, direct tool entry, settings scan exclusion, library save/reload, denied provider access, Journal persistence and safe rendering, empty weather, actual injected player playback/return, native video fullscreen visibility, offline Journal loading and card removal after real extension context invalidation. Screenshots are saved under artifacts.

## Limits and next acceptance checks

- Chromium fixture behavior is tested. Actual Netflix, Disney+, Hulu, Prime, HBO Max, Paramount+, Plex, Pluto and YouTube subscriptions/player versions need user acceptance testing. The allowlist is not a compatibility certification.
- Generic controls operate on accessible top-document HTML media. Players inside inaccessible cross-origin frames, closed shadow roots or proprietary controls may require provider adapters. Unsupported actions show a message.
- Previous/Next item use provider-specific and accessible-label controls. Skip Intro has been removed. The extension tracks updated show URLs within the launched provider for Continue Watching, while Plex keeps its own resume behavior. This does not infer watch completion or exact playback time. The original TMDB editor is retained; the deployed Worker metadata path has been tested; provider playback still needs signed-in acceptance checks.
- Real news availability and a private calendar still need checks using the user's own configuration. Keyboard suggestions use the local dictionary and learned words stay local.
- Normal-profile Chrome/Edge extension enable/disable/reload, an installed PWA window, real head switches, voice choice and focus recovery across provider sign-in screens still need hands-on acceptance testing. Command-line-loaded Chromium extensions have a different reload lifecycle than a normal Load unpacked installation.
- An extension cannot control unrelated Windows applications or capture switches while the address bar, browser UI or an unrelated native app has focus. DRM/subscriptions and provider restrictions remain in effect.
- Browser storage can be cleared or quota-limited. Export important journals/profiles. The new keys are namespaced to avoid automatically importing old personal state.

## Main files

- extension/: unpacked companion source and its settings UI.
- bennyshub/index.html + apps/tools/tools.json: gated Tools catalog and settings area.
- bennyshub/shared/extension-client.js + tool-gate.js: live connection checks.
- bennyshub/apps/tools/{streaming,dayhub,journal}/: browser applications.
- bennyshub/data-settings.html: export/reset controls.
- scripts/serve.cjs, scripts/build.cjs: local preview and public deployment output.

## Primary references

- https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/reference/api/permissions
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://kewisch.github.io/ical.js/api/ICAL.Event.html
- https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create
- https://ai.google.dev/api/generate-content
