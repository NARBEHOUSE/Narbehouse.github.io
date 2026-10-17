# Graphics quality contract

Web and desktop source implementations: 2026-10-10. The owner approved website publication after local testing on 2026-10-10. Raspberry Pi hardware acceptance remains pending. Desktop source stays local; no installer build is included.

## Player behavior

Hub Settings → Graphics quality cycles **High → Standard → Low**. High is the default for a new installation/browser. Games initially **Use Hub setting**, with per-game choices **Use Hub setting → High → Standard → Low**. Returning to Use Hub setting resumes inheritance. Preferences are local to each edition and device, with no account or cross-device synchronization.

- **High** keeps full detail and a fixed display-resolution ratio capped at 2 in Three.js games (Bowling retains its original uncapped display density), without their older adaptive quality reducers. Baseball uses its existing maximum 3× backing scale. P3GL enables full post-processing; games that originally lacked shadows still do.
- **Standard** retains each game's previous default/adaptive rendering behavior.
- **Low** reduces internal pixel count, shadows and expensive effects as listed below. HTML text and scan highlights remain sharp; gameplay timing, physics, input and speech are unchanged.

Changes apply during play without resetting a round. WebGL antialiasing is fixed at renderer creation: High/Standard use the game's original setting, and Low launches with it off. A change needing a new context shows and speaks **full change next launch**. Baseball displays the full resolved status below its canvas menus. P3GL already used no renderer antialiasing.

Saved Lightweight choices migrate to Low. Basketball/P3GL's earlier explicit High/Low choices migrate to the corresponding named mode, including the previous Standard-with-legacy records. Saved Hub and per-game Auto records now resolve to fixed High. Legacy game-specific Auto follows the Hub; new games also inherit the Hub. A saved explicit Standard or Low remains a deliberate override. Explicit saved Standard remains Standard. Returning to Hub persists a migration marker so an old override cannot reappear; no old game save is deleted.

## Profiles

All twelve Three.js games cap the internal renderer at **921,600 pixels (1280 × 720)** with its own aspect ratio and at most pixel ratio 1 in Low. Low remains bounded on every render/resize path. HTML menus, scan highlights and HUD text keep their normal CSS resolution. Resolution is recomputed on resize, including split-screen Racer's total canvas. Gameplay geometry, simulation steps, seeds, targets and picking coordinates are unchanged.

| Game / public ID | Additional Low changes |
| --- | --- |
| Basketball / basketball | No real-time shadows, floor reflector or bloom/composer; existing Low light-beam reduction; seats hidden, simpler crowd heads, decorative crowd/banner/sign motion frozen. Crowd bodies, scoreboard updates, aiming and feedback retained. Replaced post-processing resources disposed. |
| Ballista / ballista | Shadows off; launch antialiasing off; internal resolution bounded. |
| Bowling / bowling | Shadows off; launch antialiasing off. |
| Race Tracks / racetracks | Shadows off; launch antialiasing off; internal resolution bounded. |
| Robot Football / robotfootball | Shadows off; launch antialiasing off. Both Basic and Advanced settings expose the same control. |
| NARBE Pickleball / pickleball | Shadows off; launch antialiasing off. Serve target, court lines and paddle cues remain. |
| Dice / dice | Shadows off; launch antialiasing off. Dice meshes and physics retained. |
| P3GL / p3gl | Post-processing off; internal resolution bounded. Renderer antialiasing was already off. New control is in Settings → Display & Sound. |
| Fish Mystery / fishmystery | Shadows off; launch antialiasing off; internal resolution bounded. |
| NARBE Mini Golf / minigolf | Shadows off; launch antialiasing off; internal resolution bounded. |
| NARBE Racer / racer | Launch antialiasing off; total split-screen resolution bounded. Shadows were already off. All tracks, props, obstacles and set pieces retained. |
| Animal Friends / animalfriends | Shadows off; launch antialiasing off in the 3D stage. No selector in its existing inexpensive Simple/2D fallback. |
| Baseball 2 / baseball (Phaser) | Removes rounding-up supersampling; uses actual display density within its existing 1–3× bounds. Launch WebGL antialiasing off; texture interpolation preserved. No 720p cap because text and controls share this canvas. World units and input mapping stay 1000×600. |

## Inventory and other rendering audit

There are 28 game folders. The twelve Three.js entries above are the playable integrations; editor, backdrop/prop galleries and development preview pages are not additional games. No new Three.js game was found. Authoring pages do not acquire player-facing quality controls.

The 16 other games were assessed from their entry points/render loops:

- Baseball 2 has concrete excess supersampling and gets the separate profile above.
- Football's Phaser canvas is already 1000×600; Scale Manager zoom controls CSS fit, unlike Baseball's physical backing resize. Preserve its text-resolution behavior and existing antialiasing; no useful resolution reduction added.
- Show n Sound uses a 2D/Phaser wheel with essential image/text content. No distinct 3D/post-processing budget to remove.
- Bug Blaster and legacy Benny's Mini Golf draw 2D canvases with essential gameplay feedback; legacy Mini Golf already uses a 1280×720 design resolution. Brief celebrations and glow effects are not a measured sustained bottleneck. Keep these profiles unchanged.
- Slot Machine uses HTML/CSS reels, a bounded 30–250-particle celebration burst and 2D overlay that stops drawing when empty. No measured sustained graphics bottleneck; no profile introduced. Any later particle reduction must preserve random-number consumption so spin outcomes remain unaffected.
- Original Pickleball Rally is the inexpensive preserved 2D game, separate from NARBE Pickleball. No selector added.
- Battleboats, Chess/Checkers, Connect Four, Tic Tac Toe, Benny Says, Matchy Match, Word Jumble, Elouise's Word Search and Trivia Master use board/card/image/DOM interfaces or brief feedback effects. Keep normal text, images and feedback. No nonfunctional selectors added.

These audit judgments are not hardware performance guarantees; measure a suspected 2D bottleneck before adding a profile.

## Public integration for every future game

Load shared/platform.js before shared/graphics-quality.js, before renderer/game code. Use a stable lowercase ID; there is no game whitelist. Store quality only through this manager, not in unrelated game preferences. Existing renderer defaults and adaptive steps remain the inputs to pixelRatio().

```js
async function startGraphics(host, scene, camera, controls) {
  const quality = NarbeGraphics.openGame('my-new-game');
  await quality.ready; // mandatory with asynchronous/native adapters
  const renderer = new THREE.WebGLRenderer(
    quality.rendererOptions({ antialias: true, alpha: false })
  );
  host.appendChild(renderer.domElement);
  let preferredRatio = Math.min(devicePixelRatio, 2); // this game's old default
  function apply() {
    const width = host.clientWidth, height = host.clientHeight;
    renderer.setPixelRatio(quality.pixelRatio(preferredRatio, width, height));
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    quality.shadows(renderer, scene, true); // this game's old shadow choice
    // Apply game-specific visual changes, never physics/clock/seed changes.
    controls.refreshValue('graphics-quality', quality.label());
  }
  // Add to the game's existing CHOICE provider, not a second keyboard listener.
  controls.addSetting({
    id: 'graphics-quality', label: () => quality.label(),
    action: () => { quality.cycle(); controls.announce(quality.label()); }
  });
  const stop = quality.subscribe(apply);
  const size = new ResizeObserver(apply); size.observe(host); apply();
  return {
    renderer,
    frame(now, targetFPS = 60) { quality.frame(now, targetFPS); renderer.render(scene, camera); },
    adapt(nextOriginalRatio) { if (quality.get().mode === 'standard') { preferredRatio = nextOriginalRatio; apply(); } },
    dispose() {
      stop(); size.disconnect(); renderer.dispose(); quality.dispose();
      // Also dispose this game's geometries, materials and render targets.
    }
  };
}
```

controls above stands for the game's existing adapter: refreshValue must preserve the selected stable ID, and announce must use its owned speech ticket. Never add another input debounce, polling scan loop or independent speech owner. One manager instance per ID/document is shared by renderer and UI; dispose it at the owning game's teardown. Stage remounts should unsubscribe their stage listener while retaining the game manager. The manager disposes remaining stores/subscriptions on final pagehide and keeps them for a persisted back/forward-cache page.

The public methods are getHub, setHub, cycleHub, subscribeHub, openGame, ready, title and pixelRatio. A game handle has ready, get, frame, isLightweight, label, setChoice, cycle, subscribe, rendererOptions, pixelRatio, shadows and dispose. subscribe/subscribeHub return unsubscribe functions and report subsequent changes, not an initial callback; apply once after ready. get returns choice, configured mode, effective quality, legacy (null after migration) and pendingLaunch. isLightweight remains the compatibility API name for checking effective Low. frame() is a no-op compatibility hook for existing render loops; it never changes quality. Only run a game’s old adaptive routine when get().mode is standard. High must stay fixed, including when old automatic Low caches exist. Non-Three renderers can use this resolver with their own profiles.

Storage keys: narbe-graphics-settings and narbe-graphics-game-<id>. Independent game keys avoid whole-map override write collisions. Browser storage, same-origin frame messages, cross-tab storage notifications and activity reloads belong to NarbePlatform. Blocked storage degrades to in-memory behavior. Platform settings stores now expose ready and dispose; lifecycle adds onClose. No change to scan/speech ownership. See docs/development/GRAPHICS-DESKTOP-PARITY.md for the native boundary; native readiness is implemented in the desktop adapter.

No central game scaffold exists in this checkout. This example, the maintained developer-guide.html Graphics quality section and its release checklist are the integration path.

## New-game and release checklist

- Assess rendering cost; explain why an inexpensive game needs no profile.
- Resolve Hub inheritance before the first renderer construction, including native async readiness.
- Verify Standard matches prior default/adaptive behavior; test actual game-specific Low reductions.
- Test live Hub changes, explicit override, reset to inheritance, old preferences, reload and app restart.
- Apply caps to every initial/adaptive/resize path; verify aspect ratio, split views and picking alignment.
- Preserve stable settings IDs, recurring blank/Back, Auto parking/brake, owned speech and native holds/multiplayer ownership.
- Exercise actual gameplay, pause/settings/Back/resume, game exit and reopen. Check readable text, targets, character recognition and essential effects in all four modes.
- Dispose replaced targets/listeners; repeat changes and remounts to check resource growth.
- Record target-device configuration and frame-time results, or explicitly mark hardware acceptance pending. Do not claim Raspberry Pi support from Windows or preference tests alone.
- Preserve web analytics/favicon/cache integration and desktop bridge/native differences. Record every changed file and desktop status in docs/history/DEVELOPMENT-HISTORY.md.

## Recovery checkpoint

Original web source checkpoint: [local websites workspace]/Website Backups/Graphics-20261010-1791660378065. Original main commit 846545118a240bf9066d07a1a0c96998839e65d1; original working tree clean. 2,311 files / 384,650,350 bytes verified with SHA-256 before and after copy and against the backup manifest; source file set and Git status checked again before implementation.

The checkpoint contains source, assets, hidden/private configuration and ignored/untracked source. Top-level .git, node_modules, dist, artifacts, tmp, releases, output, backups, .test-profile, playwright-report and test-results were excluded. No tracked files were excluded. Dependencies/build/test output are regenerable; existing releases and earlier backups stay in place and immutable. The checkpoint contains private files and stays outside the published tree.

RECOVERY.txt, checkpoint.json, manifest.json, VERIFIED.json and working-tree.patch record the scope. To recover: preserve today's work separately, verify hashes, copy source/ into a separate recovery directory and inspect/test it. Restore the live source only with owner authorization and reconcile added files against the manifest. No rollback was run. The feature branch is not the backup.

## Raspberry Pi acceptance: pending

Reference: Raspberry Pi 5, 64-bit Debian 13, Chrome 155, hardware-accelerated Broadcom V3D WebGL (reported by the user). RAM, cooling, temperature/throttling, power supply, display refresh/output resolution and DPR must be recorded on the test device. No Pi access or FPS measurement is claimed here.

1. Test on the attached AR/direct display at its usual fixed resolution and refresh. Record Chrome version, GPU renderer, RAM/cooling and power/temperature state. Use the same browser settings and game preferences in both runs.
2. Before changes, use the verified checkpoint in a separate local source server/profile; for Basketball record both its previous Auto/Low and the exact saved preference. After changes, use Standard and Low with the same scene/mode/level. Close/reopen each game after changing graphics so antialiasing matches. Do not compare a small window to full screen.
3. Warm up each scene for 60 seconds; collect frame intervals for 120 seconds, repeat three times, then play for at least 10 minutes. Chrome Performance recording provides frame timings; a requestAnimationFrame sampler may export intervals but must exclude hidden/tab-paused periods. Report median/p95/p99 milliseconds, proportion over 33.3 ms, sustained FPS, and any long hitches. Record method and overhead. Do not cap or slow simulation to improve results.
4. Use Basketball with crowd/court and repeated shots first. Repeat for a demanding scene in all twelve 3D games and Baseball; include Racer split-screen and the games' other multiplayer modes. Keep scene/camera/action sequence comparable, note randomized scene differences. Preserve essential targets, score/dice readability and aiming/picking alignment.
5. Test Space/Enter holds, Auto Scan and speech, pause/settings/Back/resume, exit/reopen, inheritance/override/reset and resize directly on the display. The target is steady 30 FPS or better in ordinary gameplay, aiming for 60 where practical, with responsive controls and reliable speech. Log failures before changing profiles or publishing minimum hardware requirements.

Local measured results and remaining limitations are recorded in docs/testing/GRAPHICS-VALIDATION.md. Bluetooth/speech routing and OS/kiosk tuning remain separate tasks.


## Fixed High default — 2026-10-14

The previous Auto controller treated a steady 30 FPS browser cadence as inadequate performance and reduced High to Low in about 7.6 seconds. This does not distinguish GPU capacity from browser pacing. The owner authorized the simpler fallback: remove Auto and default to High in both editions.

High now stays fixed; the shared frame hook cannot lower quality. Old saved Auto records resolve to High, including native hydration before renderer creation. Basketball's old automatic Low cache cannot override High. Existing explicit Standard/Low and per-game overrides are preserved. The service-worker cache is advanced for the website.

Unit coverage checks fresh/corrupt/blocked storage, old Auto migration, slow frame cadences, Basketball's actual quality resolver, native hydration/persistence, overrides, inheritance and mode cycles. Browser validation uses a disposable OS-temp working directory and test-only copies of the games' existing CDN libraries. Electron GUI tests are not launched because of the earlier breakpoint crash.

Validation on 2026-10-14: all 24 desktop graphics/native unit checks and 14 website graphics unit checks passed. Real Chrome checks passed for Basketball, Ballista, P3GL and Baseball at DPR 2. Checks covered saved Auto migration, inherited High, full launch antialiasing, 30/25/10 FPS synthetic cadences without downgrade, explicit Low and return to Hub. Basketball additionally passed actual Hub selector cycles and iframe Settings cycles, retained High after ten seconds, and had full post-processing and shadows. The screenshot confirms Use Hub setting (High). No Electron GUI process was launched in this follow-up.
