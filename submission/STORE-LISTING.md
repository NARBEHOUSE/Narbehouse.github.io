# Benny's Hub Companion — store copy

Copy for the local Companion 1.0.8 candidate, which has not been submitted or approved. On October 4, 2026, the owner reported 1.0.7 submitted and awaiting approval, with 1.0.5 public. That historical status has not been independently checked in the publisher dashboard. Version 1.0.8 fixes Netflix framing where provider centering transforms could leave only a quarter of the picture visible. This revised 1.0.8 candidate also provides Companion-managed storage for Journal, Keyboard, Streaming and Day Hub using the existing storage permission; it adds no permissions. Previous release archives remain unchanged. Signed-in provider checks remain separate.

The [Chrome Web Store listing is live](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc). This copy supports future Chrome updates and a separate Microsoft Edge Add-ons submission; it does not establish Edge approval or approval of the pending update.

## Shared fields

- Name: Benny's Hub Companion
- Publisher: NARBE LLC (must match the verified developer account)
- Version: 1.0.8 (local candidate; not submitted or approved)
- Language: English (United States)
- Website: https://narbehouse.github.io/bennyshub/
- Privacy: https://narbehouse.github.io/bennyshub/companion-privacy.html
- Support: narbehousellc@gmail.com
- Suggested category: Accessibility, where available; otherwise Productivity.
- Price: Free. Third-party streaming subscriptions may be required.
- Short description (also in manifest): Control supported streaming players and connect Day Hub sources using one or two switches with Benny's Hub.
- Edge search terms: switch access; accessibility; video controls; assistive technology; one switch; two switches; Benny's Hub

## Full description — paste into either store

Benny's Hub Companion connects the Benny's Hub website to supported streaming players, local app-data storage and optional Day Hub sources, helping people use these features with one or two switches mapped to Space and Enter (Return).

STREAMING CONTROLS
Launch a video from the Hub to open a dedicated playback window with a compact, color-coded control row in its own area below the video. Controls include Play / Pause, Rewind 10 seconds, Fast forward 10 seconds, volume, mute, previous item, next item, fullscreen and Return to Hub. Return to Hub is always last in the scan order.

SAVED APP DATA
Journal entries and drafts save automatically inside Companion. Keyboard vocabulary and preferences, Streaming library and progress, and Day Hub weather preferences also stay in Companion storage when supported. Clearing Hub website data does not clear these extension records; normal updates preserve them. The accessible app interface stays familiar, with no file dialogs while writing. A caregiver can export and restore separate backups through Companion & data → My data. Removing Companion or its browser profile removes its stored data, so keep a separate backup. No Google account or cloud storage is required.

CONTINUE WATCHING
For shows and YouTube playlists, the Hub saves the latest playback URL on your device and uses it when you choose Continue. The original library link stays intact. Episode tracking depends on the service updating its playback URL; the service controls resume time within a video. Plex uses its own watch progress.

YOUR SCAN SETTINGS
The bar follows the Hub's scan mode, scan speed, input sensitivity and voice settings. Scan Speed remains available with Auto Scan Off because it also sets the backward-scanning interval. It begins with no highlighted control and includes that blank step between loops. In Step mode, Space moves forward, holding Space for three seconds scans backward, and Enter selects a highlighted control. Auto scan follows the Hub's centralized parking, Space brake and speech-wait preferences. Parking off scans continuously; Park when chosen lets Enter at the blank step park the scan; Auto park stops after the chosen number of complete loops. Enter while parked resumes scanning at the first control without activating it. With Space brake on, tap Space to pause scanning, then tap again to resume, or hold for three seconds and release to resume.

CHOOSE YOUR SOURCES
Use the **Streaming and news** switch in Companion settings to grant access to all listed streaming services and news feeds together. Calendar connects separately. Player adapters are included for YouTube, Plex, Netflix, Disney+, Hulu, Prime Video, HBO Max, Paramount+ and Pluto TV, with Tubi support in preview. Optional Day Hub connections retrieve news and a Google Calendar iCal feed that you choose. Permissions can be removed at any time.

GET STARTED
1. Install the Companion in desktop Chrome or Microsoft Edge.
2. Visit https://narbehouse.github.io/bennyshub/ and refresh the page if it was already open.
3. Open Companion & data → Companion settings, then turn on Streaming and news. Companion setup has installation and connection help.
4. Open Tools → Streaming. Add your own links or choose an optional starter collection through Streaming Settings → Open Editor. The public library starts empty; Quick add keeps existing entries and skips matching links.

Help & shortcuts pauses playback and offers a spoken "I need help" message, direct access to the Hub keyboard or phrase board, and a shortcut to the Hub main menu. Returning to the video leaves it paused until you choose Play.

Use Alt+Shift+B to temporarily release the player controls for signing in or ordinary mouse/keyboard use. Press it again to return to the switch bar.

No Electron application, Python helper or shared transcription key is required. The extension does not sell personal data or include advertising or analytics. Read the privacy policy for local storage and optional service connections.

The Companion does not supply movies, shows or subscriptions and does not bypass sign-in, DRM or payment requirements. Controls depend on the provider's available player elements; some actions may be unavailable, and provider changes can affect compatibility. Streaming requires internet access. This is a desktop browser extension, not a mobile Chrome extension. The Hub can also be installed as a PWA; extension availability in app windows depends on the browser.

Developed by NARBE LLC. Support: narbehousellc@gmail.com

## Image uploads — verify before reuse

- Chrome extension icon: assets/icon128.png (also packaged in the extension).
- Edge listing logo: assets/logo300.png.
- Both stores' small promotional tile: assets/promo440x280.png.
- Optional marquee / large tile: assets/promo1400x560.png.
- Screenshots: assets/01-player-controls.png through assets/05-journal.png, each 1280 × 800.
- Existing images are historical assets; verify or refresh them against the current 1.0.8 controls and settings before reuse. No new artwork is claimed by this documentation update.
- Demonstration playback must not contain a customer library, sign-in details or provider account.
- Remaining screenshots show actual settings and Hub screens with synthetic or empty data.

## Sources checked September 27, 2026

- Chrome image requirements: https://developer.chrome.com/docs/webstore/images
- Chrome listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Edge package, metadata and image requirements: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
