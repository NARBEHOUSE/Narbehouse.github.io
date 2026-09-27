# Benny’s Hub Companion — experimental

Load this directory via Chrome/Edge Extensions → Developer mode → Load unpacked. No build step is needed for the extension.

Use the Hub at http://127.0.0.1:4173/bennyshub/index.html during development, or your IDE preview at http://127.0.0.1:3000/bennyshub/index.html. Both ports also support localhost. Reload the Hub after loading or reloading the extension. Open this extension’s settings to grant access only to services you choose. No AI credential or calendar address is bundled.

Streaming opens a dedicated playback window with a centered control bar at the bottom. The bar follows the Hub's scan interval, input sensitivity, single-switch mode and voice settings, including changes made while a stream is open.

- Two switches: Space advances, holding Space for three seconds scans backward repeatedly until released, and Enter selects.
- One switch: the bar rests in an unselected dead zone. Enter starts one scan loop; Enter again selects the highlighted control and parks. A full loop without a selection also parks. There is no parking button.
- All controls are visible on the bar: green for playback, blue for sound, purple for fullscreen and red for Return to Hub, always last. Labels remain visible and a yellow outline marks the scan selection. There is no Pause/Resume switches button. For signing in or typing, Alt+Shift+B temporarily releases the keyboard and mouse; press it again to return control to the bar.
- Return to Hub reuses the launching Hub tab even if its connection is temporarily unavailable. If that tab was closed, it checks for another matching Hub before reopening the verified address in a normal browser window. Repeated return requests share one operation. Closing a player with the window close button does not open another Hub.

Plex startup begins immediately and watches for Play/Resume controls, including links and Resume dialogs. It activates these directly instead of sending simulated X/Enter/P keys. It waits only for the page to supply its controls; an empty video element cannot block the sequence. Browser autoplay rules can still require choosing Play.

After updating the extension, reload it in Chrome/Edge's Extensions page, refresh the Hub, and launch a new stream. Existing player windows can retain the old controls.

Version 0.1.8 fixes duplicate Hub tabs on return: a missing connection reply no longer triggers reopening, existing matching Hubs are reused, and concurrent return requests share a single restoration.

Version 0.1.9 removes Skip Intro from the control bar and fits YouTube's nested video container to the fullscreen playback window automatically, including when the provider controls are hidden. Surrounding recommendations and page panels are hidden during this view and restored when it ends. Return to Hub remains last in the scan order.

Version 0.1.5 reapplies browser-window fullscreen when the streaming page finishes loading. The bar's Fullscreen button now activates the service's player fullscreen control (the equivalent of YouTube's F shortcut), with a native video fullscreen fallback. It no longer toggles the browser window back to a windowed state. Space/Enter stay owned by the bar, including after entering or leaving player fullscreen. Browser-window fullscreen happens at launch; native player fullscreen requires selecting Fullscreen because the browser requires a user gesture. Provider layouts can change; the adapters still need live-account validation on paid services and do not control inaccessible cross-origin iframe players.

See ../WEB-EXTENSION-MIGRATION.md for setup, permissions, validation and known limitations. All allowed production Hub URLs currently use the /bennyshub/ path; update policy.mjs, hub-content.js and manifest.json if deploying at another path/origin.

Bundled ical.js 2.2.1 uses the MPL-2.0 license; see vendor/ICAL-LICENSE.

Version 0.1.7 matches the Hub Scan Manager's anti-tremor timing after both accepted and filtered key releases. Scan intervals (1/2/3/4 seconds), input sensitivity (50/100/200/300 milliseconds), and one-switch mode sync from the Hub while a stream is open. The three-second hold before reverse scanning stays fixed, matching the Hub.

Version 0.1.6 adds green/gray source switches and an Enable all sources action for streaming and news. Browser permission approval is required before a source shows On; choices persist and calendar setup stays separate. The setup page is also simplified.

Player startup now fits a sourced video and its player container into the already-fullscreen browser window automatically, including Plex after Play/Resume. This CSS player view does not need the native Fullscreen API's user gesture. The Fullscreen control can turn that view off; selecting it again requests the provider/native fullscreen view. Accidental clicks outside the bar cannot activate the provider or divert Space/Enter. No OS-level helper or debugger permission is used.

Previous item and Next item activate the provider playlist/episode controls, separately from Rewind 10 seconds and Fast forward 10 seconds. Seek labels and spoken feedback spell out seconds. Disabled or missing controls announce that the action is unavailable; they do not navigate browser history or restart the movie. Play/Pause tries the active provider control first, including auto-hidden controls, then falls back to the active media element. Automated validation uses provider fixtures; live signed-in provider layouts still need verification.

## Signing in and choosing a profile

Choose **Unlock browser** (before **Return to Hub**) to use the streaming website with a mouse and keyboard. The bar shows a reminder and keeps **Lock controls** available. This choice stays with that playback tab across sign-in page reloads. Choose **Lock controls** to restore switch scanning and focus protection. Alt+Shift+B toggles the same mode when the main page has keyboard focus. Netflix profile tiles can also appear as scannable bar choices; the Companion never selects a profile on its own.
