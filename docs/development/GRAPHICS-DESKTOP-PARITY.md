# Graphics quality: desktop and web parity

The owner authorized both editions on 2026-10-10, superseding the original web-only staging plan. Both source trees now expose **Auto, High, Standard, Low** in Hub Settings and **Use Hub setting** plus those four choices in supported games. The shared resolver is identical. The owner subsequently approved the website push on 2026-10-10. Desktop source remains local, with no installer build. A previously packaged installed executable is not replaced by source edits.

## Native integration

Desktop platform.js uses key-scoped native graphics stores, asynchronous ready promises, queued writes during hydration, revision ordering and disposal. native-settings.cjs persists independent Hub/game records to Electron userData/graphics-settings.json. main.js validates managed-window senders and local origins, merges only the requested key and broadcasts updates. preload.js and electron-bridge.js deliver updates to separate windows and Hub child frames, including keys the Hub has not opened itself.

Every renderer awaits authoritative settings before creating its first WebGL context. Basketball preserves classic scanner scope while deferring its runtime until ready. Pending explicit resets to Hub survive native hydration. Browser storage, native storage, scanning and speech keep their established boundaries. The editions share behavior; their saved choices are independent.

## Integration scope

The thirteen shared profiles are Basketball, Ballista, Bowling, Race Tracks, Robot Football, NARBE Pickleball, Dice, P3GL, Fish Mystery, NARBE Mini Golf, NARBE Racer, Animal Friends (3D) and Baseball 2. Desktop also includes Sphere Splash, absent from the web checkout; it receives the same four choices, native bridge, readiness, real-frame Auto sampling and Low pixel cap.

All game entry pages were selectively merged. Desktop bridge/preload and native catalog/controls remain; web analytics, favicons and service-worker integration remain. Existing desktop differences in Bowling, Race Tracks UI, Dice and Animal Friends were preserved. No whole web Hub index was copied to desktop. Authoring galleries and editors remain outside player settings.

## Local verification and recovery

Desktop tests: graphics-quality.test.cjs, graphics-native.test.cjs, graphics-electron.cjs and graphics-electron-rendering.cjs. Native integration uses the actual Electron binary, production IPC-handler bodies, preload, bridge, Hub and games in isolated temporary profiles. It does not launch external applications or alter the user's saved profile. Coverage includes native settings cycles, both frame and window propagation, reload/restart persistence, all renderer modes, Auto's real-frame hookup and deterministic slow-frame response. Other focused scan and gameplay tests cover affected contracts.

Desktop evidence lives under tmp/graphics-desktop-20261010/browser and rendering. Its checkpoint contains verified original changed-source files, not user data or dependencies. four-mode/ holds the preceding two-mode source checkpoint. See the desktop GRAPHICS-QUALITY.md, ELECTRON-SCAN-UPGRADE.md and the web docs/testing/GRAPHICS-VALIDATION.md for final outcomes and remaining device/user checks. No Pi frame-rate guarantee follows from Windows tests.

To test desktop source, close the Hub and run start_hub.bat in Benny's PC Hub. To test web source, open http://127.0.0.1:4173/bennyshub/ while scripts/serve.cjs is running. Test Settings → Graphics quality, a supported game, override/reset, pause/resume and reopening after a next-launch notice.
