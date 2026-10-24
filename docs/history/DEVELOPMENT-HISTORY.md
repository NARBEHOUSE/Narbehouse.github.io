# Development history

Detailed implementation and verification records for Benny’s Hub and the NARBE House website. This file was formerly SCAN-UPGRADE-CHANGES.md; its scope now covers all development. Historical entries retain the names and status recorded at the time. Start with [the documentation index](../README.md) for maintained guidance.

## 2026-10-24 — Make Save & test navigable and show completion

Scope: configurator website UI only; Electron port: **NO** for every changed file. No firmware, device bindings, Hub files or deployment changed. Prior copies of the three UI files are in WEBSITES/tmp/trinkey-completion-before-20261024.

Changed files: TRINKEY-CONFIGURATOR/index.html turns all three progress labels into native section links and adds a local completion result; styles.css provides link/completed-state styling and the result panel; app.mjs retains step 03 after saving/testing, automatically ends test mode after both switches have been pressed and released, requires the device's TEST 0 acknowledgement before announcing completion, provides Test again, distinguishes demo results, rejects incomplete tests, and clears prior success after edits, saves or new connections. TRINKEY-CONFIGURATOR/README.md documents the behavior. docs/history/DEVELOPMENT-HISTORY.md records scope and validation.

Verification: JavaScript syntax and all 20 existing Node tests pass. Real Chrome UI actions verified the step-03 anchor, incomplete-test rejection, two demo press/releases causing automatic completion, the Complete progress label, changed bindings clearing success and blocking testing until Save, step-03 progress after Save, and fresh per-switch results on a second test. Browser verification used demo mode; no simulated events were presented as physical-device tests.

## 2026-10-24 — Real Trinkey testing, compatible setup and small-board firmware fixes

Scope: TRINKEY-CONFIGURATOR only; normal mouse/keyboard operator. Electron port flag: **NO** for every changed file. No Hub or Electron changes, commit, or publication. Pre-change project copy and hardware evidence are under WEBSITES/tmp/trinkey-before-legacy-setup-20261024.

The attached unit identified as 239A:8157 with TinyUSB keyboard/serial, unlike the CircuitPython profile in the supplied updater folder. HELLO/GET received no reply. Added a website-driven two-stage update: exact TRRS bootloader identity check, complete UF2 and application-vector validation, IndexedDB recovery storage before any write, verified base image with a clean application filesystem, then compiled setup-file installation and read-back on CIRCUITPY. Physical double-reset and two directory grants are the customer actions; no manual download/copy. Restore uses saved firmware with bootloader blocks excluded. Uncertain/disconnected writes do not claim verified success.

Hardware exposed issues absent from desktop Python: importing runtime source exceeded RAM; compact CircuitPython omitted str.encode, bytes.decode, bytes.hex and bytearray deletion. Fixed with official 10.0.3 precompiled modules, supported constructors/formatting/slices, and a bounded startup-error protocol handler that releases HID. Normal operation still disables console, MIDI and drive. Packaging verifies compiled-source/output hashes; original 0.1.0 release ZIP is unchanged.

Changed/new project files: index.html (guided preparation, finish and recovery controls, preview 0.2); app.mjs (connection-in-progress message); lib/device.mjs (specific product filters, reuse a single authorized port, startup/legacy failure messages); lib/installer.mjs (compiled payload, verified base download, backup metadata and preparation/finish/restore state); lib/uf2.mjs (new target validation, complete-image/vector checks, application-only preparation/restoration and unconfirmed transfer handling); firmware/boot.py, code.py, narbe_config.py and narbe_runtime.py; generated firmware/narbe_settings.mpy and narbe_device.mpy; firmware/circuitpython-10.0.3.uf2, CIRCUITPYTHON-LICENSE.txt, compiled.json, manifest.json and INSTALL.txt; scripts/package.mjs; downloads/narbe-trinkey-0.2.0.zip; tests/bindings.test.mjs, tests/uf2.test.mjs and tests/test_firmware.py; README.md; docs/history/DEVELOPMENT-HISTORY.md. Ignored artifacts contain local hardware scripts/screenshots only.

Physical verification: shared UF2/installer code prepared the board and read back payload files. Live serial verified HELLO/GET, Tab+left-mouse SET and read-back, reconnect, TEST/PING/end and RESET. Chrome then connected, saved Tab+left mouse, read it back after a user-performed unplug/replug, and showed press/release detected for both physical switches. The browser's real directory-picker flow then saved a validated recovery image, wrote UF2 successfully, observed CIRCUITPY, and installed/read back all four payload files. After the user ejected/unplugged/reconnected, Chrome completed HELLO/GET and showed Space and Enter / Return. Final verification: 20 Node tests and 14 Python tests passed; JavaScript syntax and served firmware hashes passed; git diff whitespace checks passed. Normal key/click/drag behavior in a separate application remains a separate hands-on check.

Recovery incident: the initial diagnostic 1200-baud software reset erased the old TinyUSB application's first flash page before its backup was captured. The file contained every UF2 block but could not boot; attempted restoration stayed in the bootloader. This was disclosed to the user. Exact old TinyUSB firmware cannot be restored from that image, now clearly labeled original-device-NOT-RESTORABLE.uf2 with RECOVERY-NOTES.txt. The board was returned to the tested configurator. Physical reset subsequently preserved a valid working-configurator-0.2.0.uf2 image. The customer flow uses physical reset only, and validation now rejects missing/invalid application vectors before modifying a unit. The user's supplied CircuitPython Space/Enter profile is intact and distinct from the lost TinyUSB startup page.

An automatic approval review rejected a persistent debug-console boot.py modification. That action was not performed. Diagnosis instead used the existing console during the normal installation stage and the production settings-port error handler; no interactive console was enabled in saved production firmware.

## 2026-10-24 — Standalone NARBE Trinkey Configurator local prototype

Built a static customer configurator in TRINKEY-CONFIGURATOR (renamed from the user's empty TRINKEY-UPDATER folder). Ordinary mouse/keyboard setup; no Hub scanning integration. Web Serial reads and saves two keyboard/mouse bindings, preserves holds, offers defaults and physical switch testing, and provides an explicitly separate demo. One-time browser installation checks TRRS board identity and CircuitPython 10.x, stores original startup files in local IndexedDB, verifies packaged SHA-256 hashes, writes four Python files in order, and verifies each read-back. Customer installation needs a safe-mode reset/drive selection but no manual firmware download/copy. Original software can be restored through the same browser.

The device runtime retains the original TIP/RING_2 and ring/sleeve wiring behavior, adds a contact override, replaces the old HID-count reset rule, exposes keyboard + mouse and a data serial port, stores validated/checksummed settings in NVM, and releases output on connection/test transitions. The user's production updater at F:/PROJECT FILES/TOOLS/TRINKEY Updater was read only. No physical device was flashed.

Branding: NARBE House icon in the header; newly generated product illustration based on the user's covered-Trinkey reference, with the original Foundation logo. Official Adafruit product, guide, and site links included. Preserved image.png as reference. Generation prompt recorded in ASSET-NOTES.md.

Changed/added files (all under TRINKEY-CONFIGURATOR unless specified): index.html; styles.css; app.mjs; lib/bindings.mjs; lib/device.mjs; lib/installer.mjs; lib/zip.mjs; firmware/boot.py; firmware/code.py; firmware/narbe_config.py; firmware/narbe_runtime.py; firmware/manifest.json; firmware/INSTALL.txt; downloads/narbe-trinkey-0.1.0.zip; scripts/package.mjs; server.cjs; START-LOCAL.bat; package.json; .nojekyll; .gitignore; README.md; ASSET-NOTES.md; assets/trinkey-hero.png; assets/narbe-house.png; assets/narbe-foundation.png; tests/bindings.test.mjs; tests/test_firmware.py. User-supplied image.png moved with the renamed folder; local ignored artifacts/preview.jpg records browser verification. This history file updated. Electron port flag: NO for every file; no Electron or Hub code changed.

Verification: 10 Node tests and 14 Python tests passed. Tests cover mapping validation, Tab/Shift+Tab, serial fragmentation/timeouts/handshake/DTR, persistence and checksums, shared held keys/modifiers, simultaneous mouse buttons, test-mode suppression/timeouts/disconnects, exact-board installation checks, backups, ordered writes and read-back failures. Browser demo exercised Tab + mouse selection, Save, both switch indicators, Shift+Tab capture, Restore defaults, and setup guide; final logo/hero/links reviewed. Required static URLs returned HTTP 200 and packaged firmware hashes matched. Physical USB enumeration, board SRAM, covered reset access, actual installation and power-cycle persistence remain hardware test items. Local-only; not committed or deployed.

## 2026-10-21 — Bug Blaster leg proportions and articulated gait; PC parity

Corrected all six creature rigs after the owner reported overlong, awkward ant and defender legs. Ants and defenders now have compact leg segments with six roots clustered on the thorax; beetles, scorpions and the boss spider have separate joint sites, bone lengths and foot spreads. Knees keep a consistent bend and neighboring legs do not cross throughout the walking cycle. The alternating support/swing gait uses a straight planted stance, lifted return and stride distance scaled to the rendered body, replacing the former shared sine sweep and mismatched cadence. Walking persists while approaching the fence; stopped attackers brace instead of stepping in place. Ant/defender/medium antennae are shorter and elbowed, with a seamless looping twitch. Idle, attack, hit and death poses use the same rigs.

Presentation scope only: gameplay size/collisions, enemy separation, campaign balance, controls, sounds, boot targeting and lawn/house damage rendering are unchanged. Scorpions retain the requested 25% size increase and shared stinger/projectile origin. The store defender icon automatically uses the corrected atlas. The existing inexpensive 2D rendering profile remains appropriate under the graphics contract.

Verification: 394 website unit tests and 30 desktop Bug Blaster tests passed. Eight new animation regressions sample 320 phases per creature, checking fixed bone lengths, planted foot displacement, mirrored support groups, noncrossing limbs, bounded poses and walk/idle/attack selection. Chrome rendered all 288 atlas frames without cell-edge clipping and ran ten simulated seconds through the actual game loop with all enemy types and two defenders. Walk/idle/attack/hit/death contact sheets and browser/native gameplay screenshots inspected. Six real Electron checks passed: native iframe/bridge, new atlas, movement, two-switch hold-to-pause, five-row Help scan and no renderer errors; isolated runtime disposed. Public build, 3,825-file release audit and 1,192-reference link check passed. Physical Raspberry Pi and switch-device acceptance were not measured.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js — per-creature articulated geometry, stance/swing motion and animation state selection / APPLIED TO PC HUB, identical shared renderer.
- tests/bug-blaster-animation.test.cjs — geometry and motion regressions / APPLIED TO PC HUB.
- bennyshub/service-worker.js — v61 runtime cache refresh / WEB ONLY.
- tests/communication-cache.test.cjs — v60 retirement and model-cache retention / WEB ONLY.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY; PC record in ELECTRON-SCAN-UPGRADE.md.

Backups, hash-guarded port manifest, visual comparisons and verification reports: ../tmp/bug-blaster-legs-20261021/. This continues the owner's authorized web and PC update scope. Native bridge and Help files were not replaced. No installer rebuild. Hub remains the canonical game source; no SwitchedGames duplicate required.

## 2026-10-21 — Bug Blaster level unlocks and campaign economy; PC port

Owner explicitly authorized applying the reviewed progression to the website and PC Hub, then pushing. Added one shared progression catalogue used by rendering, spoken scan labels, eligibility and purchase validation. All 14 cards stay visible; level-locked cards show a padlock and the level to finish, and locked, unaffordable, completed and already-prepared items are neither scanned nor purchasable. Salt Shot starts at level 3. First-rank costs/unlocks: Defender 150 at 2; Salt 200 at 3; Boot 400 and Glue 100 at 4; Net 350 at 5; Healing 600 at 6; Zapper 900 at 7; House 1500 at 9; Bomb 1500 at 11. Later ranks have separate prices and gates through level 19. A budget regression reserves 50 for repairs each store, excludes perfect-health bonuses and confirms first-rank purchases are possible at unlock or one reward later on that baseline path. Spending on other ranks remains a choice.

Glue is explicitly a one-level consumable, auto-placed once purchased, disabled once ready, cleared on level completion and fully reversed by Undo/restart/reset. Purchase Undo now restores a complete pre-purchase snapshot, fixing retained glue/net effects, negative repair counts and the boot price/refund mismatch. The net is now permanent, refills each level and retains upgrades after breaking; its 50 HP per rank is consistent in-store and in-game. Repair House restores only house health so points are not spent repairing a net that will refill free. New-game reset also clears upgraded boot cadence and leftover venom.

Balance adjustments preserve 20 rounds of 150 seconds and existing enemy damage, HP, targeting, controls, art and sounds. The abrupt ant doubling at level 8 is spread across 8–10. Salt cadence is 10/8/6/4/2.5/1.75 seconds; healing restores 10 HP every 12/6/5 seconds. Final cannon rank opens at 16, second house at 17, bomb frequency and last net rank at 18, and last healing rank at 19. This bounds the former one-second cannon and two-second healing combinations.

Verification: 386 website unit tests (including 16 progression/economy tests), 17 real Chrome interaction checks and 19 real Electron fixture checks; desktop combat/purchase tests pass. Browser screenshots at 1280×720 and 390×844 inspected. Native bridge, five-row pause menu and Help retained. Full deterministic 60 FPS/1280×720 campaign models exercise attack, balanced and defensive purchase priorities, saving and repairs, with one modeled action every 6 or 8 seconds; each action may choose the current or next two scan targets. Balanced and defensive routes finish all 20 levels at both intervals. Attack without glue fails (20 at 6 seconds; 9 at 8 seconds); glue on the difficult waves provides a viable attack route. The no-stomp whole-campaign control fails at level 4. Individual well-equipped late checkpoints can survive without stomping; these are bounded simulations, not claims of human/hardware difficulty validation. The reproducible script is scripts/check-bug-blaster-balance.cjs.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/{game.js,index.html,progression.js,shop.js,scan-access.js} — gameplay economy and accessible store / APPLIED TO PC HUB, preserving native index/Help differences.
- tests/bug-blaster-progression.test.cjs, tests/bug-blaster-targeting.test.cjs, tests/helpers/bug-blaster-runtime.cjs — transaction, eligibility, budget and combat tests / APPLIED TO PC HUB.
- bennyshub/service-worker.js — v60 invalidates old runtime caches / WEB ONLY.
- tests/communication-cache.test.cjs — cache retirement check / WEB ONLY.
- scripts/check-bug-blaster-balance.cjs — optional full native-loop tuning model / WEB DEVELOPMENT ONLY.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY; PC port recorded in its ELECTRON-SCAN-UPGRADE.md.

Backups, staged files, hash-guarded manifests, simulations and browser/native reports are outside the repository at ../tmp/bug-blaster-progression-20261021/. No installer rebuild. Physical switch acceptance remains an owner check. The existing Hub game URL and shared thumbnail remain canonical, so SwitchedGames needs no duplicate update.

## 2026-10-20 — Twelve-voice web publication

The owner authorized publication with “push web.” All 370 web unit tests pass. The tested runtime is unchanged from the passing 12-model browser check, public build, 3,824-file audit and 1,191-reference check. Publication uses the existing main-branch GitHub Pages workflow; local evidence stays outside the repository. Changed file for this release record: docs/history/DEVELOPMENT-HISTORY.md (WEB documentation only).

## 2026-10-20 — PC Hub Faster mode and twelve-voice port

At the owner's explicit request to put the same choices in the PC Hub, ported the website Faster engine and all 12 voices (six male/six female). The PC source had Natural and Custom voices only, so this also adds the existing Speaker voice mode control, validated native speechMode/fastVoice persistence and the same narrow model-CDN permission for the local Faster worker. Natural remains the default and its saved voice stays independent. The existing desktop audio channel, Bluetooth lead-in, native bridge, Python assistance broker and scan controller are preserved. No installer rebuilt.

Desktop scope and every changed file are recorded in the PC Hub's ELECTRON-SCAN-UPGRADE.md and COMMUNICATION-SPEAKER.md. This supersedes the previous NOT PORTED status for the Faster runtime/catalogue. The website runtime is unchanged in this follow-up. Backups, hash-guarded apply manifest and verification evidence: ../tmp/pc-fast-voices-20261020/.

Verification: 58 desktop communication unit tests pass; the existing Custom Voice native fixture passes settings navigation, imports, pronunciation-name persistence, reload, held-Enter cycling and removal. The real Electron fixture passes all 12 voices with nonzero generated audio and muted selected-output playback, forward/backward switch cycling, native persistence through a full restart, cached/reloaded/offline Northern English speech, a separate Keyboard window, mode switching by Enter and native Help while minimized. No renderer errors; the narrow Settings screenshot was inspected. All 21 runtime/provenance hashes and changed JavaScript syntax checks pass. Physical listening remains an owner check.

Changed website files: docs/history/DEVELOPMENT-HISTORY.md and docs/development/COMMUNICATION-SPEAKER.md — documentation only, recording the completed source port and test status.

## 2026-10-20 — Twelve Faster voices, including British choices

Expanded the website's Faster catalogue from six to exactly 12 voices, with six male and six female choices. The original six retain their order and identifiers. Added Alba (female, Scottish English), Northern English (male, UK), Jenny (Dioco) (female, Irish), Joe (male, US), Southern English (female, UK) and Mike (male, US). Existing Cori remains labelled UK. George remains a Natural/Kokoro voice. Selected voice downloads remain lazy and use the existing pinned Piper revision and model cache. Southern English uses 16 kHz; the other 11 voices use 22,050 Hz. The worker already handles each model's sample rate. Existing defaults, saved preferences, scanning behavior and playback timing are unchanged.

Preserved upstream model cards and Jenny's required attribution, with byte lengths/hashes in SOURCES.json and dataset/license links in THIRD-PARTY-NOTICES.txt. Alan was considered but not added because its linked upstream dataset notice states All Rights Reserved without a clear grant. No model binaries are added to the website source; only the chosen model downloads on first use.

Changed files (scope / Electron port flag):
- bennyshub/shared/communication-speech.js — append six choices to the Faster catalogue / WEB ONLY, NOT PORTED.
- bennyshub/shared/communication-fast-worker.js — map the added IDs to pinned public models / WEB ONLY, NOT PORTED.
- bennyshub/shared/communication-settings.js — describe 12 voices, six male/six female and British options / WEB ONLY, NOT PORTED.
- bennyshub/shared/communication-fast-vendor/SOURCES.json, THIRD-PARTY-NOTICES.txt — provenance, hashes and dataset terms / WEB ONLY, NOT PORTED.
- bennyshub/shared/communication-fast-vendor/VOICE-ALBA-MODEL-CARD.txt, VOICE-NORTHERN-MODEL-CARD.txt, VOICE-JENNY-MODEL-CARD.txt, VOICE-JOE-MODEL-CARD.txt, VOICE-SOUTHERN-MODEL-CARD.txt, VOICE-MIKE-MODEL-CARD.txt, VOICE-JENNY-DATASET-NOTICE.txt — unchanged upstream notices / WEB ONLY, NOT PORTED.
- tests/communication-speech.test.cjs, tests/communication-fast-worker.test.cjs — full-cycle size, gender balance, persistence of every added ID, rapid selection of the final added model / WEB ONLY, NO ELECTRON PORT NEEDED.
- scripts/check-communication-fast.cjs — all 12 real models and current 18-voice Natural catalogue / WEB ONLY, NO ELECTRON PORT NEEDED.
- scripts/check-communication-speaker.cjs — 12 switch-operated Faster previews and existing Custom-voice controls in menu traversal / WEB ONLY, NO ELECTRON PORT NEEDED.
- docs/development/COMMUNICATION-SPEAKER.md — current catalogue, attribution and verification / WEB ONLY.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: all communication unit tests pass. The existing real-page speaker integration passes all 18 Natural and 12 Faster previews, switch/Auto access, cancellation, routing and app actions. The unmocked Chrome single-thread CPU check generates nonzero audio with every Faster model and completes muted selected-output playback. Added-voice generation for the same new sentence measured 343 ms (Alba), 895 ms (Northern English), 382 ms (Jenny), 362 ms (Joe), 263 ms (Southern English), and 357 ms (Mike). These are PC observations, excluding first download/setup and the existing Bluetooth silent lead-in; Pi performance and listening quality remain owner checks. The real worker test also passes shared ownership through Keyboard/Phrase Board/RTC, repeat caching, cancellation, reload persistence and new offline speech, with no page errors. All 21 vendored-source hashes match. Build, release audit (3,824 files, zero problems), and all 1,191 page/asset references pass. No publication or Electron work.

Evidence: artifacts/communication-fast.json and communication-fast-settings.png; narrow pre-change backups in ../tmp/british-fast-voices-20261020/.

## 2026-10-19 — Bug Blaster thumbnail and PC Hub update; shared catalog images

At the owner's request, replaced bennyshub/images/games/bennysbugblaster.png in place with a 1280×720 capture of active upgraded gameplay. The previous title-screen image is gone from the active source/build; its backup is outside the website. New SHA-256: 6caa0a4d56ea863264e3a0ebc5835956382cace371fe96db39b92b8dab77e041. NARBE House and the web Hub already reference this canonical file.

The owner explicitly requested updating Benny's PC Hub. Applied and hash-verified the full Bug Blaster remaster, all subsequent fixes and this thumbnail there. Desktop index.html retains electron-bridge.js; game.js preserves the existing five-row pause menu and Help action while incorporating the web blank-store/dialog fixes. Native scan-access.js, style.css, all seven existing WAV files, shared managers and other apps are unchanged. This supersedes earlier NOT PORTED status for these Bug Blaster runtime/assets changes.

The owner also reaffirmed Benny's Hub as the source of truth for the two showcase indexes. SwitchedGames now references the Hub's catalog image URLs for every game card and Details image, plus the Racer hero poster. All 28 duplicated local game thumbnails and the empty images/games directory are removed; branding and switch-kit photos remain local. Its README records the shared-image policy. Audited all 33 NARBE House game/tool cards: each launch path and thumbnail file matches the appropriate Hub catalog. The showcase copy/layout remains maintained by each website.

Changed files (scope / Electron port flag):
- bennyshub/images/games/bennysbugblaster.png — new canonical gameplay capture / SHARED, APPLIED TO PC HUB.
- PC Hub bennyshub/apps/games/BENNYSBUGBLASTER/{game.js,index.html,crowd.js,presentation.js,shop.js,sounds/remastered/garden-theme.mp3} — remaster and accumulated fixes; preserve native integration / APPLIED TO PC HUB.
- PC Hub ELECTRON-SCAN-UPGRADE.md — desktop implementation/verification ledger / DESKTOP ONLY.
- ../SWITCHEDGAMES/index.html, README.md, CHANGELOG.md and all 28 removed images/games/*.png — canonical image URLs and no duplicate thumbnails / WEB ONLY, NO ELECTRON PORT NEEDED.
- tests/communication-cache.test.cjs — update the migration fixture for shell v59, asserting v58 is retired and v59/model caches survive / WEB ONLY, NO ELECTRON PORT NEEDED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: eight staged desktop browser checks and sixteen actual Electron checks pass, including launch from the native catalog/iframe, 288 sprite frames, thumbnail hash/display, blank Enter, all store cards, scan eligibility, start, five-second pause, Help, settings/Back/resume, salt priority/muzzle, charged-only marker, damage/repair pixels and decoded original squish/salt plus new music. Zero renderer errors. Canvas readback is warmed before exact repair comparison. The hidden native fixture used a disposable OS-temp working directory/profile and cleaned it after closing. Website build, 3,817-file release audit and all 1,191 page references pass. SwitchedGames local candidate checks verify all 30 cards and Details images/links against Hub files, the shared hero poster, removal of the duplicate folder and zero browser exceptions; its card/Details screenshots were inspected. Both catalogs use the new canonical Bug Blaster image, and all 33 NARBE House cards match Hub paths. Publication authorized by the owner’s subsequent “push it” instruction. All 370 publication unit tests pass; build, release audit and page-reference checks also pass. No installer rebuilt. Raspberry Pi and physical switch acceptance remain pending.

Backups, guarded copy manifests, native/browser reports and screenshots: ../tmp/bug-blaster-pc-20261019/. Prior release archives and personal profiles are unchanged.

## 2026-10-19 — Bug Blaster targeting marker only when charged

At the owner's request, the boot's pulsing ring and crosshair are now drawn only when its cooldown is complete and no stomp animation is active. The marker disappears immediately on stomp activation and returns at full charge. The presentation renderer and native fallback apply the same rule. Selected targets, switch scanning, cooldown values, sounds and damage are unchanged.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js — gate the remastered reticle on boot readiness / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/game.js — apply the same visibility rule to the native fallback reticle / WEB ONLY, NOT PORTED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: both JavaScript syntax checks pass. Live-browser pixel checks cover empty, just-before-full and full charge for 4/3/2-second cooldowns: all nine visibility results match readiness and retain the selected enemy. Actual stomp activation starts its animation with no target-marker pixels; dead targets have no marker. No browser page errors. Website build passed. Evidence and narrow backups: ../tmp/bug-blaster-rebuild/charge-only-target-qa.json and before-charge-only-target-*.js. No publication or Electron work.

## 2026-10-19 — Bug Blaster damage feedback, salt priorities and matching boots

Restored clearly visible health-driven deterioration at the owner's request. The continuous lawn blends from the existing healthy green through yellow-green, straw-yellow and brown as health falls. House walls and roof weather, cracks accumulate, damaged plaster exposes brick, roof tiles chip over opaque backing, and windows crack and break. Garden flowers retain their original health-dependent wilting/death, with gradual bending and fallen petals; window-box flowers droop and lose their blooms. Healing reverses the appearance using the same health value. The field and house garden still share one texture, and both main and wing roofs remain opaque.

Salt Shot now reevaluates living enemies before every volley: highest current HP first, with proximity to the fence breaking ties. Previously it retained its initial highest-HP target until removal, including the death-animation interval. Dead and zero-HP enemies no longer absorb shots. Other living enemies can still intercept a shot normally. Purchase rules, damage, firing cadence, muzzle coordinates, projectile speed and sounds are preserved.

The title demonstration now calls the same boot-art renderer as the playable stomp, including its leather shading, laces, sole, treads and green trouser leg. The menu's descent, impact, retreat and target defeat remain native; gameplay stomp damage, targeting pulse and timing remain native.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js — health palettes and wear, gradual flower detail, bounded two-surface lawn cache and shared boot renderer / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/game.js — living-target selection per volley, dead-enemy collision exclusion and title boot hook / WEB ONLY, NOT PORTED.
- tests/bug-blaster-targeting.test.cjs — six targeting/cadence/power/collision regression cases / WEB ONLY, NOT PORTED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: syntax checks and all six targeting tests pass. Browser screenshots at 100/75/50/25 HP were inspected; a native healing purchase restores 50 to 100 HP and returns the fixed-time yard/house image to exactly the healthy pixels. The joined field/garden matches a full-screen lawn draw at 100/88/75/62/50/37/25 HP, including intermediate blends. Whole-frame readback after warmup confirms 431 roof-interior samples for each 150px/105px house at all four damage stages are opaque and independent of the background. Live salt firing picks the highest-health, nearest tied living enemy, replaces that target when another becomes stronger, and matches the barrel-tip origin and aim exactly (damage 1, base speed 15). The title screenshot was inspected, its impact invokes the shared boot at the target coordinates and defeats the demonstration bug; gameplay and shared upper-boot pixels match. No browser page errors. Website build, release audit (3,817 public files, zero problems) and page-reference check (1,191 references, zero issues) pass.

The two cached lawn surfaces use about 10.5 MiB at 1440×960; existing articulated atlases remain unchanged. Raspberry Pi and physical-switch hardware acceptance remain pending. Backups and browser evidence: ../tmp/bug-blaster-rebuild/ (before-salt-targeting-game.js, before-restored-deterioration.js, before-shared-boot-*, damage-targeting-qa.json, health-*.png, shared-title-boot.png). No publication or Electron work.

## 2026-10-19 — Bug Blaster opaque roof fix

Fixed the house roof's hollow chevron polygon: it now fills the complete tiled roof silhouette, including the center above the wall, with an opaque roof surface and a defined eave edge. Main house and both expansion wings use the same corrected geometry. Cannon mounting, projectiles and gameplay remain unchanged.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js — fill the entire roof silhouette / WEB ONLY, NOT PORTED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: syntax check passed; the three-house gameplay screenshot was inspected with the rear-mounted cannons. Whole-frame comparisons against magenta and cyan backgrounds found zero differences at 582 interior roof samples for each of the 150px main house and 105px wing; all samples are fully opaque. No browser page errors. The website build passed. Backup: ../tmp/bug-blaster-rebuild/before-solid-roof-presentation.js. No publication or Electron work.

## 2026-10-19 — Bug Blaster lawn continuity and cannon mounting

At the owner's request, brightened the healthy lawn to a clearer green and reduced the dark vignette. The battlefield, fence gaps and house garden now crop a single full-height cached texture, eliminating the separate muted field and flat pale-green house yard. Existing health-related grass decay remains synchronized across both sections; flowers and fence details are retained.

Moved salt cannons from the front eaves to the battlefield-facing rear roof ridge. The drawn mount and aim calculation also define the projectile origin at the extended barrel tip; recoil follows firing. This applies to the main house and both smaller wings. Salt purchase requirements, targeting, cooldown, damage, projectile speed and original sounds remain unchanged.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js — brighter continuous lawn, rear roof cannon geometry and muzzle position / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/game.js — shared house-garden background hook and salt-shot muzzle origin hook / WEB ONLY, NOT PORTED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: JavaScript syntax checks pass. Browser pixel comparison finds zero differing channels between the joined lawn sections and one uninterrupted full-screen draw at 100, 70, 40 and 20 HP. Nine cannon firing checks cover all three house sections against left, center and right targets: origins match barrel tips and projectile directions point to the targets, retaining damage 1 and speed 15. The 1440×960 screenshot was inspected; no page errors. Backup: ../tmp/bug-blaster-rebuild/before-unified-lawn/. Website build, release audit (3,817 files) and page-reference check (1,191 references) pass. No publication or Electron work.

## 2026-10-19 — Original Bug Blaster restored with articulated sprites

Restored the original game after the owner rejected the replacement. The original 20-wave progression, 150-second rounds, 14 upgrades, shop/undo behavior, damage rules, and two-switch controls remain. The previous replacement is archived outside the website under ../tmp/bug-blaster-rebuild/replacement-prototype; the original checkpoint is ../Website Backups/BugBlaster-replacement-20261019-1792448251216.

The presentation layer builds 288 transparent atlas frames from articulated body parts: 16 walk, 8 idle, 10 attack, 4 hit, and 10 death frames for each of six enemy/defender types. Jointed legs, beetle shells, mandibles, antennae, claws, and the segmented scorpion tail have distinct poses; no static character-image transforms are used. Cached lawn texture, cottage details, salt/venom projectiles, boot impact, glue, bomb and zapper effects improve the original view. The original blue pulsing target and red open crosshair are retained with outlined edges; the OS reduced-motion preference suppresses the pulse and decorative burst particles.

Owner-requested movement changes prevent same-side bugs from stacking: free spawn positions, sidestepping, and waiting behind crowded edges. Glued bugs stay anchored; enemy/defender combat contact remains native. Scorpions are 25% larger than the initial remaster, have a curved sharp barb, and fire from the same attack-pose tip coordinates in gameplay and the menu demonstration. Original projectile damage, speed, cadence and target selection remain.

The owner also requested a full store catalogue. All 14 upgrades remain visible in stable positions from level one, with custom illustrated icons, prices, and gray unavailable states. Eligibility still uses the original budget, prerequisite, healing and purchase-limit rules. Unavailable upgrades reject pointer and switch activation; empty Undo is skipped. This store is CHOICE: if Ben stops pressing, gameplay does not advance. Root scanning retains its recurring silent -1 stop and the original shared scan owner.

At the owner's follow-up, all original gameplay sound effects are retained, including squish, shell defeat, impacts, salt, bomb, zapper and ready cue. The six WAV files are byte-identical to the checkpoint. Newly generated unused effects were moved outside the website. A new instrumental garden music track uses the existing Music setting and volume. Provenance: ElevenLabs Music v2, flow 07gwHx5Wbb5D1Tui12DF, generation 3YJcXcUzY3h1de85UlKM, created 2026-10-19; warm instrumental strings/woodwinds/marimba garden-defense score, no vocals. File SHA-256: 5516e428daa28a79dd90f7c4c79fc5ce1ec74bcffe168174f566753c2189b0f3.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/BENNYSBUGBLASTER/game.js — restored original, with narrow lawn, crowd, and stinger-origin hooks / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/index.html — loads crowd, presentation and store layers / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js — articulated atlases, environmental art, effects, pulse and music selection / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/shop.js — full illustrated catalogue, eligible-only input and empty-Undo filtering / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/crowd.js — spawn spacing and movement separation / WEB ONLY, NOT PORTED.
- bennyshub/apps/games/BENNYSBUGBLASTER/sounds/remastered/garden-theme.mp3 — generated instrumental music / WEB ONLY, NOT PORTED.
- tests/bug-blaster-crowd.test.cjs — six crowd regression cases / WEB ONLY, NOT PORTED.
- bennyshub/service-worker.js — cache version v59 / WEB ONLY, NOT PORTED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY.

Verification: six crowd tests pass, covering 80 mixed bugs at 360/768/1440 widths, overtaking for 500 updates, fixed glue anchors, defender spawning and dead-enemy exclusion. Browser checks verify all 288 frames differ within their animation state, exact scorpion attack-tip/projectile coordinate equality, original WAV URLs returning HTTP 200, and original scan-access.js/style.css byte identity. Stomp/bomb/laser damage, one-hit tracking, friendly fire and RNG consumption match the original renderer. Real Space/Enter navigation passes menu → shop → level intro → gameplay → native five-second Enter-hold pause → settings → Back → resume, with fresh blank selections. Chrome gameplay screenshots inspected at 1440×960 and 768×640, and store screenshots at 1440×960, 360×640 and 320×568; no page errors. Store checks verify 14 visible cards at zero points, scan cycle Start Level → Main Menu → -1, inert blank Enter and disabled pointer clicks, earning 150 points enabling Salt Shot, purchase enabling Undo, Undo refunding the purchase, and locked prerequisites remaining inert even when affordable. Syntax checks, website build, release audit (3,817 public files), and 1,191 page references pass.

Rendering remains cached 2D at the original canvas resolution; no new quality selector is needed for this measured workload. On this Windows headless Chrome session, 80-bug spacing averaged 0.215 ms/update, and cached lawn plus 80 sprite draw submissions averaged 0.137 ms/iteration (CPU submission timing, not end-to-end FPS). The six prebuilt atlases occupy about 46.4 MiB. Raspberry Pi and physical-switch hardware acceptance remain pending. No publication, Electron changes, or installer build performed.

## 2026-10-19 — One current Mini Golf thumbnail (web + PC Hub)

Removed the unreferenced legacy bennysminigolf.png at the owner’s request. narbeminigolf.png remains the sole active Mini Golf thumbnail; the homepage, Hub catalog, and SwitchedGames card and Details view use that canonical artwork. SwitchedGames now references the published Benny’s Hub image directly and removes its obsolete local duplicate. The PC Hub keeps the matching image locally for offline use.

Changed files (scope / Electron port flag):
- bennyshub/images/games/bennysminigolf.png — remove unused old thumbnail / BOTH, PORTED.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY; desktop record is ELECTRON-SCAN-UPGRADE.md.

Verification: no active source references to the deleted legacy thumbnail; canonical web and PC images have identical SHA-256 hashes. SwitchedGames card and Details render the 1366 × 768 canonical image, all 30 catalog entries retain their launch URLs and feature flags, and no page errors occur. Website build, release audit (3,813 files) and 1,188 page-reference checks pass. The SwitchedGames files and publication are logged in that repository’s CHANGELOG.md. Previous release archives remain unchanged; no installer rebuilt. Backup: ../tmp/minigolf-18-20261019/switchedgames-thumbnail/before/.

## 2026-10-19 — General steering and fresh Different options (web + PC Hub)

The owner reported the model repeatedly returning the prompt example labels, then clarified that steers should be general and Different should replace all three options. Removed the concrete steering example from both prompt instructions and output shape. The model now chooses broad communication purposes. Different sends up to 12 recently displayed labels; normalized repeats are omitted without another provider call and the client rotates general fallback directions if necessary, including on provider failure. Current labels are included even after an exchange reset. History records committed rows, resets for new room speech/Clear, and remains separate from conversation memory. Saved personal defaults remain the regular fallback. Existing scan commit/parking/Back behavior is retained.

Scan classification: **“If Ben stops pressing, does anything in the game keep happening?” No = CHOICE.** No scan-controller changes.

Changed files (scope / Electron port flag):
- bennyshub/apps/tools/rtc-lite/core.js — broad prompt, bounded steer avoidance and fallback rotation / BOTH, PORTED.
- bennyshub/apps/tools/rtc-lite/app.js — displayed steer history and Different request/fallback / BOTH, PORTED.
- bennyshub/apps/tools/rtc-lite/providers.js — optional steering history through cloud/local calls / BOTH, PORTED with native key bridge preserved.
- bennyshub/apps/tools/rtc-lite/README.md — steering behavior / BOTH, PORTED.
- tests/rtc-steer.test.cjs — prompt regression, repeated/failing AI rotation and provider forwarding / BOTH, PORTED.
- scripts/check-rtc-steer.cjs — actual Different rotation, deferred row and history reset checks / WEB harness also exercises PC Hub Electron.
- workers/byok/src/rtc.ts — optional bounded avoidSteers contract / WEB ONLY.
- workers/byok/tests/worker.test.mjs — real Worker forwarding, validation and no repair for repeats / WEB ONLY.
- workers/byok/README.md — protocol and deployment notes / WEB ONLY.
- docs/history/DEVELOPMENT-HISTORY.md — this record / WEB ONLY; native record is ELECTRON-SCAN-UPGRADE.md.

Verification: 336/336 website tests; TypeScript check and 8/8 real workerd tests; the existing browser-to-Worker/Hub launch suite; 15 browser scenarios and the same 15 in native Electron with actual switch controls; 54/54 applied PC Hub logic/speech/steer checks. The new scenarios force repeated model labels for six Different requests, provider failure, a deferred update inside the Steer row, and new-room history reset. All four viewport sizes fit. Website build, release audit and 1,186 Pages links pass. Model responses in tests are fixtures, so generality/relevance is prompt-guided and still depends on the selected model; exact normalized repeat avoidance and fallback rotation are enforced by code. No paid provider call or installer rebuild. Backups/reports: ../tmp/rtc-steer-general-20261019.

Rollout: the owner’s existing website/Worker publication authorization continues for this correction. PC Hub source was applied and verified against the tested staged bytes. Worker version 15bc240d-52b3-435e-9738-d5fdefe0f23a is deployed with existing variables/secrets preserved; health reports ready and website CORS preflight returns 204. This source revision is the matching GitHub Pages release.

## 2026-10-19 — RTC Lite Steer row, editable defaults, and suggestion focus (web + PC Hub)

Scope: owner-supplied Steer requirements, explicitly extended by “make sure works on PC hub too.” Initial brief status: **Electron port: pending**. That status is superseded for this feature by the authorized PC Hub implementation. The PC Hub cloud-key/native speech integrations are preserved; the web Worker remains independent. After local verification, the owner explicitly requested website publication and the Cloudflare Worker update. No installer rebuild is included.

Cloud rollout: on 2026-10-19 the existing bennys-hub-byok Worker was deployed with preserved variables, secrets and Durable Object migration history. Version e609c425-04f9-4150-993e-63e4da3a0026 replaced 01f7abef-a2ad-49d7-b37c-d748255c4ee7 and serves 100% of traffic. Live health reports ready; the connection page returns 200, the website-origin generate preflight returns 204, and unauthenticated generation returns 401 with the expected CORS origin. These checks made no provider calls. This source revision is the corresponding authorized GitHub Pages release; the release workflow validates tests, build, immutable Companion checksums, release audit and Pages links before deployment.

Scan classification: **“If Ben stops pressing, does anything in the game keep happening?” No = CHOICE.** Five board rows retain stable IDs, recurring root -1, bidirectional row-local Back, live row narration, and owned Wait for Speech. Successful and saved-phrase fallback boards jump to generalRow only when on the board outside an entered row. Parked completion stays parked and the next Enter resumes at generalRow without selecting. Entered rows defer replacement and keep their parent return. Keyboard/other screens are not moved.

The first three steer labels accompany eight replies in one AI response; Different stays fixed. Controls never speak publicly or enter user conversation memory. Steer defaults use the existing predictive edit/save flow, validate 1–3 words/32 characters and normalized uniqueness, and persist with defaults. Missing/invalid AI labels fall back without rejecting the eight replies or spending another call. Older stored defaults load cleanly. Restore and Clear use the personal/built-in steer defaults. Avoid requests honor the Worker's 80-item cap; local validation retains the complete current exchange history.

Changed web files (scope; Electron port flag):
- bennyshub/apps/tools/rtc-lite/app.js — commit/jump, parked resume, steering, history, busy state and default editing; Electron port: implemented in PC Hub.
- bennyshub/apps/tools/rtc-lite/core.js — steer defaults/validation, output schema and prompt direction; Electron port: implemented as matching focused changes, preserving desktop reply behavior.
- bennyshub/apps/tools/rtc-lite/providers.js — steer forwarding and bounded web Worker avoid payload; Electron port: implemented with native own-key route preserved.
- bennyshub/apps/tools/rtc-lite/index.html — fifth row, stable steer/edit IDs and five-row layout; Electron port: implemented.
- bennyshub/apps/tools/rtc-lite/README.md — behavior, editing, checks, and separate cloud rollout; Electron port: matching PC Hub documentation updated.
- bennyshub/apps/tools/rtc-lite/RTC-LITE-CONTEXT.md — maintained behavior and owner-authorized desktop scope; Electron port: matching PC Hub context updated.
- workers/byok/src/rtc.ts — optional bounded steer input and server prompt forwarding; Electron port: not applicable (native PC Hub uses its own provider path).
- workers/byok/README.md — explicit Worker redeployment requirement and older-client support; Electron port: not applicable.
- workers/byok/tests/fixture.mjs — configurable board fixture and avoidance-safe phrase; Electron port: not applicable.
- workers/byok/tests/worker.test.mjs — input bounds, missing/invalid model steers, one-call behavior and old clients; Electron port: not applicable.
- tests/rtc-steer.test.cjs — shared schema/validation/provider regressions; Electron port: copied to PC Hub tests.
- scripts/check-rtc-steer.cjs — actual switch keys, row/park/deferred update, editing/persistence, Wait for Speech, cancellation and four viewport checks; Electron port: same harness exercises PC Hub native preload with its runtime wrapper.
- docs/history/DEVELOPMENT-HISTORY.md — this file-level scope and verification record; Electron port: corresponding ELECTRON-SCAN-UPGRADE.md entry.

Additional PC Hub files: tests/electron-rtc-lite.cjs (20 tiles, five-row loop, entered-row deferral expectations, and current communication-settings IPC fixture); tests/rtc-steer.test.cjs; ELECTRON-SCAN-UPGRADE.md. The six RTC Lite app/docs files listed above also changed in PC Hub. Desktop originals were checked against backup before replacement and staged/applied bytes verified. Backups and local reports: ../tmp/rtc-steer-20261019.

Verification: website 334/334 tests; Worker TypeScript check, dry-run build and 7/7 workerd integration tests; existing browser-to-Worker authorization/Hub launch/exit suite; 13 Steer browser scenarios and the same 13 in real Electron with native preload; PC Hub 46/46 existing logic/speech tests plus 6/6 new steer tests; existing Electron API 4 checks and load/setup 9 checks. Five-row screenshots at 800×600 were inspected in Chrome and Electron; all four sizes through 1366×900 fit with normal/larger type. Website build and release audit passed with zero problems. Providers and speech in feature tests are fixtures; real AI quality and Ben's Surface acceptance remain device checks. The existing Electron UI suite passes all 19 checks with zero errors on its isolated rerun. Its first run under the concurrent build hit a held-key timing assertion; the isolated rerun required no application change. The legacy fixture first needed communication:getSettings/saveSettings handlers for the already-present native bridge.

## 2026-10-18 — Pi Bluetooth quality fixed through WirePlumber configuration

The owner reported that the deployed RTC microphone-release workaround still started messages with muffled audio and switched to higher quality mid-message. They confirmed WirePlumber 0.5.8 on their Raspberry Pi 5 with Chromium and a USB camera microphone. After turning Listening off to restore quality, running wpctl settings bluetooth.autoswitch-to-headset-profile false, and turning Listening back on, they confirmed consistently high quality across several messages. The command with --save was then supplied to retain the working policy after reboot; persistence/reboot validation has not yet been reported. Upstream 0.5.8 configuration and WirePlumber's settings/wpctl documentation confirm this setting is supported.

No additional website playback change was released. A local experiment to wait for asynchronous capture cleanup before opening output passed 332 unit tests, shared speaker UI integration, real Chromium capture/playback checks, build and release checks. Once the owner confirmed the Pi setting alone solved the issue, that experiment was set aside and all ten touched files were restored from backups verified against HEAD. Its patch is retained locally under ignored artifacts/rtc-handoff-order-unshipped.patch. Existing deployed runtime behavior, shell v56, voices, models, Companion and Electron remain unchanged. This entry and the troubleshooting notes document the confirmed device-specific result; they do not claim a new website fix or automatic Bluetooth profile detection.

Changed-file manifest (scope / Electron port flag):

- bennyshub/apps/tools/rtc-lite/README.md — WEB support notes for the confirmed Pi/WirePlumber setup, temporary test, persistence and reversal / NOT APPLICABLE to Electron runtime.
- docs/development/COMMUNICATION-SPEAKER.md — WEB speaker troubleshooting and owner validation / NOT APPLICABLE to Electron runtime.
- docs/history/DEVELOPMENT-HISTORY.md — WEB evidence, unshipped experiment disposition and scope / NOT APPLICABLE to Electron runtime.

## 2026-10-18 — Release RTC microphone during communication speaker playback

The owner reports muffled, phone-like output from a Bluetooth speaker while RTC listening is on, using a USB camera microphone on a Raspberry Pi 5 with Chromium/Chrome. Turning Listening off restores quality; Phrase Board and Keyboard sound normal. All three already share the same synthesis/output path. RTC previously suppressed input samples during speech while keeping the microphone endpoint and a zero-gain 16 kHz playback graph open. The behavior is consistent with a Bluetooth headset/capture profile, but browser APIs cannot inspect the actual OS profile. The owner explicitly suggested turning the mic off during speech and back on afterward. There is only one mic; no microphone picker was added. Short-word voice pronunciation was explicitly left aside, with no voice/model/text changes.

RTC now holds physical capture closed for each owned public speech ticket. It stops microphone tracks and closes their AudioContext, or aborts Browser recognition, while retaining the loaded recognition worker and already captured jobs. After the final message ends or is cancelled, capture resumes after the existing 500 ms echo tail. Stable capture epochs discard stale permission/start results; leaving RTC or switching listening off cancels pending reconnects. The actual microphone ID is retained where available, including resolving default aliases by device group; an exact-device reconnect failure stops listening instead of selecting a different input. Browsers that expose only a default alias retain that default behavior. Native scan narration keeps its prior sample suppression behavior.

Microphone processing uses a silent AudioContext sink on supported browsers, avoiding an unnecessary physical playback stream; older browsers retain the zero-gain fallback. RTC with active listening supplies a per-message 2.2-second notBefore deadline. Synthesis runs immediately, and the shared channel pads only the remaining handoff time, with its original 750 ms minimum and a five-second upper bound. This accounts for the upstream WirePlumber two-second profile-restore timer without stacking a full wait after synthesis. Keyboard, Phrase Board, Help, previews and RTC with listening off keep their previous timing. Natural and Faster voice settings remain unchanged. Shell cache v56 preserves downloaded models. Companion and Electron are untouched.

Verification: all 328 unit tests pass, including track release, overlapping/idempotent holds, retained worker/queued audio, stale permission completion, same-input reconnect, missing input, stopping during playback or reconnect delay, Browser recognition cancellation, silent-sink fallback and deadline/default-padding behavior. The existing real-page speaker integration passes all 14 Natural/six Faster previews, switch/Auto controls, persistence, cancellation, shared Hub/app service and message actions. The new isolated Chromium fixture uses a synthetic microphone, real capture graph and muted real selected-output playback: capture processes at 16 kHz through a none sink, every public playback begins with zero live microphone tracks, listening resumes afterward, and the recognition model loads once across repeated/replaced/cancelled messages. Measured remaining pads were 2.182/2.167 seconds; leaving RTC leaves zero live tracks. The fixture does not establish physical Bluetooth quality; owner Pi listening/handoff acceptance remains pending. No fixed voice-generation delay or model reload was added.

Build passed; completed-build audit: 3,804 public files / 508,063,048 bytes, no problems; all 1,186 page/asset references pass. An early link/audit attempt overlapped the build and saw incomplete output; both were rerun successfully after build completion. Companion 1.1.0 remains SHA-256 25da9ff5bbfb7050f6f516450be861d601a6101b46255b402b053f033e411b58. Evidence: artifacts/rtc-speaker-capture.json and streaming-fixes/rtc-capture-*.log. Source backup: Website Backups/RTC-speaker-quality-20261018-1792342341097.

Changed-file manifest (scope / Electron port flag):

- bennyshub/apps/tools/rtc-lite/speech.js — WEB capture hold/reconnect lifecycle and silent input-processing output / CANDIDATE for a separately authorized Electron pass; not ported here.
- bennyshub/apps/tools/rtc-lite/app.js — WEB owned public-ticket microphone handoff / CANDIDATE; not ported here.
- bennyshub/shared/communication-channel.js, communication-speech.js — WEB optional bounded handoff deadline while retaining ordinary output timing / CANDIDATE; not ported here.
- bennyshub/service-worker.js — WEB shell refresh / NOT APPLICABLE to Electron.
- tests/rtc-speech.test.cjs, tests/communication-channel.test.cjs, tests/communication-cache.test.cjs — WEB capture race, handoff/default timing and model-cache regressions / NOT APPLICABLE to Electron.
- scripts/check-rtc-speaker-capture.cjs — WEB real Chromium capture/playback/reconnect acceptance fixture / NOT APPLICABLE to Electron.
- bennyshub/apps/tools/rtc-lite/README.md, docs/development/COMMUNICATION-SPEAKER.md, docs/history/DEVELOPMENT-HISTORY.md — WEB behavior, timing, validation and scope records / NOT APPLICABLE to Electron.

## 2026-10-18 — Six Faster speaker voices

After confirming Faster is much better and faster on the Raspberry Pi 5, the owner requested three male and three female voices. Faster now offers LJ, Kristin and Cori (female), and Bryce, Norman and John (male). Cori is UK English; the other five are US English. The existing Speaker voice control cycles and auditions the six choices. Its selection is saved independently from Natural, and existing Faster users retain LJ. Natural remains the default and keeps its original voices and runtime. This is a website-only update; Companion and Electron are untouched.

All six use pinned medium Piper models with public-domain source recordings documented by their upstream cards. Each selected voice downloads on demand and remains cached for offline use. Only one inference session stays in memory; changing voices releases it, reuses the phonemizer and aborts obsolete downloads. Completed audio is cached by voice and text with its sample rate. Rapidly cycling back to a previous voice rewarms its model before reporting ready. Shell cache v55 preserves model downloads. No private message/audio persistence was added.

Verification: all 319 unit tests pass. The real-page speaker integration passes all 14 Natural and six Faster previews, rapid changes, exit cancellation, keyboard/Auto selection, persistence, Hub iframe routing, all five message actions, game Help with general TTS off, output isolation, default-off and disconnect behavior. The fixture now polls at 50 ms while waiting for an Auto selection; its former default one-second polling could miss the selected item. No scanner runtime or timing changed. The real-model browser check passes all six voices, correct/non-silent audio, selected-sink muted playback, rapid cycling, one shared worker across Keyboard/Phrase Board/RTC Lite, cached repeats, cancellation, independent preferences, and a new Norman message offline after reload. Final same-sentence CPU synthesis times on this Windows PC: LJ 413 ms, Bryce 535 ms, Kristin 371 ms, Norman 344 ms, Cori 408 ms and John 426 ms. These exclude first download/model setup and the unchanged 750 ms Bluetooth lead-in. The owner's Pi confirmation applies to original LJ; listening and timing acceptance for the five new voices on the Pi remains pending.

Build passed; release audit checked 3,804 public files / 508,059,829 bytes with no problems, and all 1,186 page/asset references passed. All 14 pinned vendor files match their recorded source and dist hashes. Settings layout was visually inspected. Companion 1.1.0 remains SHA-256 25da9ff5bbfb7050f6f516450be861d601a6101b46255b402b053f033e411b58. Evidence: artifacts/communication-fast.json, communication-fast-settings.png and streaming-fixes/six-voices-*.log. Source backup: Website Backups/Six-fast-voices-20261018-1792341039033.

Changed-file manifest (scope / Electron port flag):

- bennyshub/shared/communication-speech.js — WEB six choices, separate saved preference and warm-up ownership / CANDIDATE for a separately authorized Electron pass; not ported here.
- bennyshub/shared/communication-settings.js — WEB enabled Faster voice control and spoken labels / CANDIDATE; not ported here.
- bennyshub/shared/communication-fast-worker.js — WEB per-voice models, cache isolation, session release and superseded-download cancellation / CANDIDATE; not ported here.
- bennyshub/shared/communication-fast-vendor/VOICE-BRYCE-MODEL-CARD.txt, VOICE-KRISTIN-MODEL-CARD.txt, VOICE-NORMAN-MODEL-CARD.txt, VOICE-CORI-MODEL-CARD.txt, VOICE-JOHN-MODEL-CARD.txt — WEB pinned upstream model cards / CANDIDATE only with a separately authorized runtime port; not ported here.
- bennyshub/shared/communication-fast-vendor/SOURCES.json, THIRD-PARTY-NOTICES.txt — WEB voice provenance and hashes / CANDIDATE only with a separately authorized runtime port; not ported here.
- bennyshub/service-worker.js — WEB shell cache refresh / NOT APPLICABLE to Electron.
- tests/communication-speech.test.cjs, tests/communication-fast-worker.test.cjs, tests/communication-cache.test.cjs — WEB voice selection, migration, race/cancellation and model-cache coverage / NOT APPLICABLE to Electron.
- scripts/check-communication-speaker.cjs, scripts/check-communication-fast.cjs — WEB real-page switch and six-model acceptance coverage / NOT APPLICABLE to Electron.
- docs/development/COMMUNICATION-SPEAKER.md, docs/history/DEVELOPMENT-HISTORY.md — WEB usage, measurements and scope records / NOT APPLICABLE to Electron.

## 2026-10-18 — Optional Faster speaker voice for Raspberry Pi

The owner reported later communication messages taking up to ten seconds on a Raspberry Pi 5 (8 GB), while the PC is fast, and explicitly asked to preserve current PC behavior. Added a manual, device-local Speaker voice mode setting: Natural (existing default, all 14 Kokoro voices) / Faster (Piper LJ English female). Returning to Natural restores the previously selected Natural voice. No automatic quality change or playback-rate change occurs. Speaker Mode's selected output, native scanning, general-TTS independence and 750 ms Bluetooth lead-in are retained. Companion and Electron remain untouched.

Faster loads a separate single-thread SIMD CPU worker only when selected. It shares the existing owned-ticket channel and Hub/iframe service. Changing mode cancels playback and terminates the previous worker. It keeps completed messages in a bounded memory-only cache and deliberately does not run speculative phrase/draft generation on the slow CPU. Its pinned public model/config are cached separately from the app shell; speech text/audio are not persisted. The runtime assets and notices are pinned in communication-fast-vendor, with exact-byte Git attributes. The build permits only the specific phonemizer .data asset. Shell cache v54 preserves downloaded voice models.

Verification: all 313 unit tests pass; existing real-page speaker integration covers 14 Natural voices, switch/Auto controls, the new mode toggle, permission guards, cancellation, app actions, game Help and output isolation. The new real-model browser check passes Keyboard, Phrase Board and RTC Lite, one shared worker, selected-sink muted playback, cancellation, settings persistence, cached model reuse after reload, and a new message offline. Forced CPU comparisons on this Windows PC generated three new texts in 304/323/431 ms with Piper versus 3661/3699/5754 ms with Kokoro q8 (roughly 11–13 times faster). Integrated Faster generation was 287 ms for a fresh sentence and 0 ms for its repeat; started events 318/26 ms exclude the unchanged silent lead-in. Actual Pi timing and physical voice-quality acceptance remain pending; PC numbers are not a Pi guarantee. Initial integration testing exposed a fixture that read a previous ended state; the fixture now waits for the selected text's generation and completion, and the full rerun passes.

Build passed; release audit: 3,799 public files, 508,053,669 bytes, no problems. All 1,186 page/asset references pass. Every new pinned runtime file has matching source and dist hashes, including the required .data file. Natural's communication-worker.js is unchanged. Companion 1.1.0 is unchanged at SHA-256 25da9ff5bbfb7050f6f516450be861d601a6101b46255b402b053f033e411b58. Evidence: artifacts/communication-fast.json, communication-fast-settings.png and speaker-latency/benchmark.json. Source backup: Website Backups/Speaker-fast-mode-20261018-1792338275150.

Changed-file manifest (scope / Electron port flag):

- .gitattributes — WEB pinned runtime byte preservation / NOT APPLICABLE to Electron.
- bennyshub/index.html — WEB opt-in voice-mode setting / CANDIDATE for a separately authorized Electron pass; not ported here.
- bennyshub/shared/communication-settings.js — WEB spoken setting and disabled-state rendering / CANDIDATE; not ported here.
- bennyshub/shared/communication-speech.js — WEB per-device mode, worker ownership and original voice restoration / CANDIDATE; not ported here.
- bennyshub/shared/communication-fast-worker.js — WEB optional local CPU speech generation / CANDIDATE; not ported here.
- bennyshub/shared/communication-fast-vendor/piper.js, piper_phonemize.wasm, piper_phonemize.data — WEB pinned optional phonemizer runtime / CANDIDATE; not ported here.
- bennyshub/shared/communication-fast-vendor/ort.wasm.min.js, ort-wasm-simd.wasm — WEB pinned optional inference runtime / CANDIDATE; not ported here.
- bennyshub/shared/communication-fast-vendor/PIPER-LICENSE.txt, ONNX-LICENSE.txt, ESPEAK-COPYING.txt, VOICE-MODEL-CARD.txt, THIRD-PARTY-NOTICES.txt, SOURCES.json — WEB licenses, upstream sources and hashes / CANDIDATE only with a separately authorized runtime port; not ported here.
- bennyshub/service-worker.js — WEB shell refresh and on-demand runtime caching / NOT APPLICABLE to Electron.
- scripts/build.cjs — WEB explicit public phonemizer-data inclusion / NOT APPLICABLE to Electron.
- scripts/check-communication-speaker.cjs — WEB real-page switch and existing-voice regression coverage / NOT APPLICABLE to Electron.
- scripts/check-communication-fast.cjs — WEB real Faster-model and app acceptance check / NOT APPLICABLE to Electron.
- tests/communication-speech.test.cjs, tests/communication-fast-worker.test.cjs, tests/communication-cache.test.cjs — WEB mode migration, worker cancellation, complete messages and cache regression coverage / NOT APPLICABLE to Electron.
- docs/development/COMMUNICATION-SPEAKER.md, docs/history/DEVELOPMENT-HISTORY.md — WEB usage, implementation, measurements and scope records / NOT APPLICABLE to Electron.

## 2026-10-18 — Readable Streaming search keyboard text

The owner reported dark text on the dark default search keyboard. Native letter/control buttons and prediction chips were using the browser's black button text instead of inheriting the page's light foreground. A scoped CSS inheritance rule now gives them white text in Default and the theme's light foreground in Slate, while existing theme colors and bright scan-selection foregrounds still take precedence. Search input, keyboard layout and switch behavior are unchanged. This is a website-only follow-up; Companion 1.1.0 remains byte-identical and no Electron files were changed.

Verification: an isolated Edge renderer measured black on rgb(42,42,42) before the change and white on the same background afterward. Control labels, letters and numbers were visually checked. The prediction-row highlight remains black on yellow; Slate keys/predictions use rgb(245,246,250). Typing and the existing scan selection worked. The cache migration check passes with shell v53, and the Companion package check retains SHA-256 25da9ff5bbfb7050f6f516450be861d601a6101b46255b402b053f033e411b58. Local screenshots and computed-color evidence: artifacts/streaming-fixes/search-keyboard-*. Source backup: Website Backups/Streaming-keyboard-contrast-20261018-1792335443169.

Changed-file manifest (scope / Electron port flag):

- bennyshub/apps/tools/streaming/style.css — WEB search keyboard contrast / CANDIDATE for a separately authorized desktop pass; not ported here.
- bennyshub/service-worker.js — WEB shell cache refresh / NOT APPLICABLE to Electron.
- tests/communication-cache.test.cjs — WEB existing cache-migration check / NOT APPLICABLE to Electron.
- docs/history/DEVELOPMENT-HISTORY.md — WEB implementation record / NOT APPLICABLE to Electron.

## 2026-10-18 — Streaming save recovery, confirmed clearing and Companion 1.1.0

The owner reported a false other-window conflict whenever a movie/show opened, requested confirmation before clearing progress/search history and a separate Clear Watch History action for Recently Watched, and reported Plex Previous/Next failing while Netflix worked. The installed Companion is 1.0.8; the owner reports 1.0.9 pending Chrome Web Store approval. At the owner's direction the next candidate is **1.1.0**. After local verification, the owner authorized pushing this release to the website repository. The owner will install Companion 1.1.0 locally and submit it to Google only if that test succeeds. This task does not install in the owner's profile or submit to a store. Electron stays untouched.

The save warning came from comparing a cached app snapshot with playback feedback that the Companion had already written into browser and Companion storage. The website now takes the current playback map as its baseline, merges independent titles and newer ordinary playback records, preserves queued changes during in-flight acknowledgements, and retries bounded revision races. Concurrent resets/deletions and catalog edits retain conflict protection instead of silently resurrecting or replacing records. This repair is website code and works with the existing storage-capable Companion protocol.

All three clear actions now open a spoken CHOICE dialog: fresh/recurring blank stop, Cancel first, dialog-only scan and Tab focus, Escape/long-Enter cancellation, with native hold thresholds unchanged. Progress clearing preserves Recently Watched entries while removing resume links. Watch-history clearing removes the entries and saved resume links, including active playback tracking, while preserving the library. Search clearing only removes saved searches. Desktop/mobile layouts were inspected.

Plex's native Previous/Next buttons were present and enabled, but its Link handler ignored click-only activation while focus stayed on the switch toolbar. Its public client source confirms Shift+Left/Right map to the same item actions. The Plex adapter now supplies mousedown/mouseup before click, keeping focus on the toolbar and letting Plex consume the trailing click. Previous retains Plex's native restart/previous semantics. Netflix and other provider handlers remain unchanged. Ten-second seeking continues to change the media currentTime directly; it does not send keyboard shortcuts.

Validation: 307 unit tests pass; eleven real-browser provider fixtures pass, including Plex's press-dependent single activation, Netflix unchanged, disabled controls, fullscreen and focus capture; six Streaming scan groups pass, including every confirmation type, speech, cancellation, blank Enter, Tab trapping and Auto. The Streaming scan fixture now awaits real app-storage initialization before advancing its fake clock and checks the existing keyboard row Back stop before wrapping. The real Companion bridge verifies player feedback followed by new movie/show launches in the same frame saves without a false conflict or pending queue. The full real-bridge progress suite also passes YouTube, Netflix, Disney+, Prime Video and Hulu capture/Continue/reset checks. An initial return assertion exceeded its five-second fixture timeout during the concurrent build; a clean full rerun passed without a runtime change. Build passed; public audit checked 3,787 files with no problems; 1,186 page/asset references passed. Cache v52 preserves downloaded communication model caches.

Package: releases/1.1.0/bennys-hub-companion-1.1.0.zip, 30 members, 114,031 bytes, SHA-256 25da9ff5bbfb7050f6f516450be861d601a6101b46255b402b053f033e411b58. Only manifest.json (version) and player-adapters.js differ from 1.0.9; permissions and shared helper bytes are unchanged. The original 1.0.9 release and download remain SHA-256 34afd049789f41159061ec9df9c63b6844f59eae38f61c8912f3240ecc203e90. An intermediate local 1.0.10 candidate is preserved but superseded by the owner's 1.1.0 choice; only 1.1.0 is linked and included in dist. The corrected package still needs live signed-in Plex acceptance after installation. Test fixtures use isolated profiles and synthetic data; inspecting the owner's old live player did not update their installed extension.

Source backup: Website Backups/Streaming-sync-confirmations-20261018-1792333138918. Local evidence: artifacts/streaming-fixes/ and artifacts/scan-completion-tools/streaming.json plus desktop/mobile confirmation screenshots.

Changed-file manifest (scope / Electron port flag):

- bennyshub/shared/app-storage.js — WEB storage / NOT APPLICABLE to Electron's native storage.
- bennyshub/apps/tools/streaming/app.js, index.html, style.css, web-streaming.js — WEB confirmations/history / CANDIDATE for a separately authorized desktop pass; not ported here.
- bennyshub/service-worker.js, bennyshub/extension-setup.html — WEB cache/download / NOT APPLICABLE to Electron.
- extension/player-adapters.js, extension/manifest.json — COMPANION Plex fix/version / NOT APPLICABLE to Electron's native playback controls.
- extension/README.md — COMPANION documentation / NOT APPLICABLE to Electron.
- tests/companion-data-client.test.cjs, tests/communication-cache.test.cjs — WEB regressions / NOT APPLICABLE to Electron.
- tests/player-adapters.test.cjs, scripts/check-player-fullscreen.cjs — COMPANION regression fixtures / NOT APPLICABLE to Electron.
- scripts/check-player-progress.cjs — WEB/COMPANION real-bridge regression / NOT APPLICABLE to Electron.
- scripts/check-scan-tools-streaming.cjs — WEB scan/dialog regression / NOT APPLICABLE to Electron.
- submission/START-HERE.md, submission/STORE-LISTING.md, submission/REVIEWER-INSTRUCTIONS.md, submission/VALIDATION.md, submission/COMPANION-SHA256SUMS.txt — WEB/COMPANION release records / NOT APPLICABLE to Electron.
- docs/history/DEVELOPMENT-HISTORY.md — WEB/COMPANION implementation record / NOT APPLICABLE to Electron.
- Generated local releases/1.1.0/**, bennyshub/downloads/bennys-hub-companion-1.1.0.zip and dist/** — WEB/COMPANION candidate/build artifacts / NOT APPLICABLE to Electron; prior artifacts remain immutable.

## 2026-10-18 — Reuse downloaded communication voices on the website

Ported the desktop speech latency fix into the website after the owner reported the repeated “preparing / first download” message there. Preserve a single ready Hub worker across tools, cache repeated messages, and silently prepare short visible/settled communication text. Status text distinguishes actual setup from message generation. The service-worker shell version is v51; model caches are preserved. Newly updated iframes tolerate an already-open older Hub service until refresh.

Validation: 298 unit tests; existing browser speaker integration; real WebGPU worker with Phrase Board, Keyboard and RTC Lite; one worker and zero additional model/voice requests after setup; cached selections returned in 0 ms. The first test sentence generated in 256 ms. Muted playback and completion passed. The public build, release audit and 1,186 links passed. Companion archive remains SHA-256 34afd049789f41159061ec9df9c63b6844f59eae38f61c8912f3240ecc203e90. Details and limitations are in docs/development/COMMUNICATION-SPEAKER.md. The original desktop runtime was only read for comparison; this pass does not alter or launch Electron.

Changed-file manifest (scope / Electron port flag):

- bennyshub/shared/communication-channel.js, communication-worker.js, communication-settings.js — WEB shared runtime / FROM DESKTOP (no new desktop port needed).
- bennyshub/shared/communication-speech.js — WEB shared service / FROM DESKTOP plus old-web-Hub compatibility; desktop follow-up unnecessary.
- bennyshub/apps/tools/phraseboard/board-live.js, rtc-lite/app.js, keyboard/app.js — WEB app hooks / FROM DESKTOP, adapted to preserve browser-only behavior.
- bennyshub/service-worker.js — WEB cache version / NOT APPLICABLE to Electron.
- tests/communication-channel.test.cjs, communication-worker.test.cjs, communication-speech.test.cjs — WEB tests / FROM DESKTOP plus old-tab regression.
- tests/communication-cache.test.cjs — WEB cache migration regression / NOT APPLICABLE to Electron.
- scripts/check-communication-speaker.cjs — WEB existing integration fixture support / NOT APPLICABLE to Electron.
- scripts/check-communication-reuse.cjs — WEB real-worker and cross-app reuse verification / NOT APPLICABLE to Electron.
- docs/development/COMMUNICATION-SPEAKER.md, docs/history/DEVELOPMENT-HISTORY.md — WEB documentation / NOT APPLICABLE to Electron.

## 2026-10-17 — Authorized desktop port and website/Companion 1.0.9 release

The owner explicitly authorized adding the speaker features to the Electron app, including Python control-bar Help/Suction, then pushing the website repository. This supersedes the earlier local-only/Electron-read-only scope for this task. The desktop port is implemented in its separate workspace; the website push does not publish an Electron installer. All prior release ZIPs remain unchanged. The owner will upload Companion 1.0.9 to the Chrome dashboard; no store submission was performed here.

Desktop general TTS and communication speech are independent. The native settings store, preload/platform/frame synchronization and authenticated loopback Help/Suction bridge preserve original mode-off SAPI behavior. Streaming Help/Suction and Messenger video Help use the Hub player without bringing the Hub in front of video. Requests have owned completion, cancellation, sequence checks and a 45-second deadline. The general TTS pill was repaired to follow native state. Desktop source backups and a 72-file manifest remain in `tmp/communication-desktop-backup-20261017/`; desktop integration documentation is `COMMUNICATION-SPEAKER.md`.

Companion manifest is 1.0.9. The production ZIP has 30 members and 113,808 bytes, SHA-256 `34afd049789f41159061ec9df9c63b6844f59eae38f61c8912f3240ecc203e90`. The public download link and tracked CI checksum point to that exact package. Reviewer, privacy and release documentation describe the fixed Help action and local voice generation. Service worker is v50.

Validation after preserving upstream RTC Lite commits 2b8511a and 63ab316: 288 website unit tests, 1,186 page/asset references and production audit (3,787 files, no problems); the previously completed actual browser app/Companion fixtures and all-14-voice synthesis remain passing. Desktop: 57 Node and 25 Python checks; actual isolated Electron Hub/iframe/dedicated-RTC actions, switch-selected game Help, native Python client with minimized-Hub Help/Suction, disconnect/no fallback, cancellation, native settings persistence and TTS-label assertions all pass. Real Electron generated 76,800 samples and completed muted playback on two distinct outputs (eight enumerated). First generation including setup took 7,635 ms, cached repeat 4 ms. Physical Bluetooth listening, Raspberry Pi testing and signed-in provider checks remain manual. Every GUI fixture used an isolated OS-temp cwd/profile; the production app/profile was not launched for tests.

Changed website files for this release (Electron flags reflect the separately completed port):

- `.gitattributes` — BUILD; Electron NOT APPLICABLE. Preserve upstream runtime bytes and hashes; the upstream ONNX module retains its original blank-line whitespace.
- `bennyshub/apps/games/BENNYSBASEBALL2/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSBASEBALL2/js/game.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSBOWLING/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSDICE/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSDICE/js/game.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSFISHMYSTERY/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSFISHMYSTERY/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSFOOTBALL/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSFOOTBALL/js/game.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSMATCHYMATCH/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSMATCHYMATCH/script.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSPEGGLE/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSPEGGLE/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSRACETRACKS/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSRACETRACKS/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSSPHERESPLASH/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/CHASINGRAINBOWS/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/CHASINGRAINBOWS/js/app.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/NARBEKART/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/NARBEKART/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/NARBEMINIGOLF/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/NARBEMINIGOLF/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/NARBEPETPALS/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/NARBEPETPALS/js/game.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/PICKLEBALLRALLY/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/ROBOTFOOTBALL/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/ROBOTFOOTBALL/js/ui.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/TRIVIAMASTER/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/games/TRIVIAMASTER/script.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/tools/keyboard/app.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/tools/keyboard/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/tools/phraseboard/board-live.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/tools/phraseboard/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/tools/rtc-lite/app.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/apps/tools/rtc-lite/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/companion-privacy.html` — WEB; Electron NOT APPLICABLE / website-specific
- `bennyshub/extension-setup.html` — WEB; Electron NOT APPLICABLE / website-specific
- `bennyshub/index.html` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/service-worker.js` — WEB; Electron NOT APPLICABLE / website-specific
- `bennyshub/shared/communication-channel.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-companion.js` — WEB; Electron NOT APPLICABLE / website-specific
- `bennyshub/shared/communication-settings.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-speech.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/ESPEAK-COPYING.txt` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/KOKORO-LICENSE.txt` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/ONNX-LICENSE.txt` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/PHONEMIZER-LICENSE.txt` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/SOURCES.json` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/THIRD-PARTY-NOTICES.txt` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/TRANSFORMERS-LICENSE.txt` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/kokoro.web.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/ort-wasm-simd-threaded.jsep.mjs` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-vendor/ort-wasm-simd-threaded.jsep.wasm` — WEB; Electron PORTED (desktop adaptations where needed)
- `bennyshub/shared/communication-worker.js` — WEB; Electron PORTED (desktop adaptations where needed)
- `developer-guide.html` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `docs/development/COMMUNICATION-SPEAKER.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `docs/history/DEVELOPMENT-HISTORY.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `extension/README.md` — COMPANION; Electron NOT APPLICABLE / website-specific
- `extension/background.mjs` — COMPANION; Electron NOT APPLICABLE / website-specific
- `extension/hub-content.js` — COMPANION; Electron NOT APPLICABLE / website-specific
- `extension/manifest.json` — COMPANION; Electron NOT APPLICABLE / website-specific
- `extension/player-content.js` — COMPANION; Electron NOT APPLICABLE / website-specific
- `extension/player-help.mjs` — COMPANION; Electron NOT APPLICABLE / website-specific
- `scripts/check-communication-speaker.cjs` — TEST/BUILD; Electron NOT APPLICABLE / website-specific
- `scripts/check-companion-toolbar-speech.cjs` — TEST/BUILD; Electron NOT APPLICABLE / website-specific
- `scripts/package-companion.cjs` — TEST/BUILD; Electron NOT APPLICABLE / website-specific
- `submission/COMPANION-SHA256SUMS.txt` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `submission/PERMISSIONS-AND-PRIVACY.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `submission/REVIEWER-INSTRUCTIONS.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `submission/START-HERE.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `submission/STORE-LISTING.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `submission/VALIDATION.md` — DOCUMENTATION; Electron NOT APPLICABLE / website-specific
- `tests/communication-channel.test.cjs` — TEST/BUILD; Electron PORTED (desktop adaptations where needed)
- `tests/communication-help.test.cjs` — TEST/BUILD; Electron NOT APPLICABLE / website-specific
- `tests/communication-worker.test.cjs` — TEST/BUILD; Electron PORTED (desktop adaptations where needed)
- `tests/dice-input.test.cjs` — TEST/BUILD; Electron NOT APPLICABLE / website-specific

## 2026-10-17 - Speaker Help and independent TTS (local candidate)

The owner requested caregiver Help on the chosen speaker and communication with general TTS off. Speaker Mode now independently controls deliberate messages; general TTS controls ordinary scanning/system narration. Turning general TTS off does not stop an active public message. Three Phrase Board message-box gates and the RTC Lite status were updated.

Routed 19 existing Help actions across 17 games. Each index loads the shared channel/service; each action preserves its original fallback and text. Pet Pals keeps its chime and repeated request. Help focus labels and instructions remain private. A transient noninteractive status reports preparation/completion/failure without adding scan stops.

Companion forwards only fixed Help through its managed-player route to the same original Hub. Device IDs remain on the Hub origin. General TTS and Toolbar Speech can both be off. New requests, leaving Help, return, page exit and player close cancel work. Wrong/missing Hub and speaker failures report without default fallback; requests expire after 45 seconds. A responding Hub with Speaker Mode off preserves forced native Help. Reload the updated Companion, refresh the Hub and open a new stream for this local test. No new permissions, published release, push or Electron pass; historical release ZIPs are untouched.

Changed files (WEB/COMPANION/TEST/DOCUMENTATION only; Electron NOT PORTED):

- `bennyshub/apps/games/BENNYSBASEBALL2/index.html`
- `bennyshub/apps/games/BENNYSBASEBALL2/js/game.js`
- `bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html`
- `bennyshub/apps/games/BENNYSBOWLING/index.html`
- `bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js`
- `bennyshub/apps/games/BENNYSDICE/index.html`
- `bennyshub/apps/games/BENNYSDICE/js/game.js`
- `bennyshub/apps/games/BENNYSFISHMYSTERY/index.html`
- `bennyshub/apps/games/BENNYSFISHMYSTERY/js/ui.js`
- `bennyshub/apps/games/BENNYSFOOTBALL/index.html`
- `bennyshub/apps/games/BENNYSFOOTBALL/js/game.js`
- `bennyshub/apps/games/BENNYSMATCHYMATCH/index.html`
- `bennyshub/apps/games/BENNYSMATCHYMATCH/script.js`
- `bennyshub/apps/games/BENNYSPEGGLE/index.html`
- `bennyshub/apps/games/BENNYSPEGGLE/js/ui.js`
- `bennyshub/apps/games/BENNYSRACETRACKS/index.html`
- `bennyshub/apps/games/BENNYSRACETRACKS/js/ui.js`
- `bennyshub/apps/games/BENNYSSPHERESPLASH/index.html`
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/ui.js`
- `bennyshub/apps/games/CHASINGRAINBOWS/index.html`
- `bennyshub/apps/games/CHASINGRAINBOWS/js/app.js`
- `bennyshub/apps/games/NARBEKART/index.html`
- `bennyshub/apps/games/NARBEKART/js/ui.js`
- `bennyshub/apps/games/NARBEMINIGOLF/index.html`
- `bennyshub/apps/games/NARBEMINIGOLF/js/ui.js`
- `bennyshub/apps/games/NARBEPETPALS/index.html`
- `bennyshub/apps/games/NARBEPETPALS/js/game.js`
- `bennyshub/apps/games/PICKLEBALLRALLY/index.html`
- `bennyshub/apps/games/ROBOTFOOTBALL/index.html`
- `bennyshub/apps/games/ROBOTFOOTBALL/js/ui.js`
- `bennyshub/apps/games/TRIVIAMASTER/index.html`
- `bennyshub/apps/games/TRIVIAMASTER/script.js`
- `bennyshub/apps/tools/phraseboard/index.html`
- `bennyshub/apps/tools/rtc-lite/app.js`
- `bennyshub/index.html`
- `bennyshub/service-worker.js`
- `bennyshub/shared/communication-companion.js`
- `bennyshub/shared/communication-speech.js`
- `developer-guide.html`
- `docs/development/COMMUNICATION-SPEAKER.md`
- `docs/history/DEVELOPMENT-HISTORY.md`
- `extension/README.md`
- `extension/background.mjs`
- `extension/hub-content.js`
- `extension/player-content.js`
- `extension/player-help.mjs`
- `scripts/check-communication-speaker.cjs`
- `scripts/check-companion-toolbar-speech.cjs`
- `scripts/package-companion.cjs`
- `tests/communication-help.test.cjs`
- `tests/dice-input.test.cjs`

Validation: all 278 website unit tests passed; all 1,142 page/asset checks passed; 27 changed JavaScript files passed syntax checks. The communication runner passed all five message actions with general TTS off, changing TTS during playback, Spacebar/Return game Help selection, Pet Pals' repeated Help, mode-off restoration, sink failure and existing Settings/scan behavior. The real-extension provider fixture passed selected-speaker Help with both TTS preferences off, disconnected output, rapid replacement, leaving Help, native restoration and the existing toolbar scan/persistence/layout checks. The 30-file Companion candidate passed package validation without writing production releases. Physical speaker listening and Raspberry Pi testing remain user checks. Source backups: desktop workspace tmp/communication-help-backup-20261017. A separate local-development Companion ZIP (including localhost support) is at tmp/bennys-hub-companion-speaker-help-local.zip; SHA-256 CDA5EAFAA169F3394A0BE76061D60492A8F96AF5DB8C18136D5F517E3E25462F. It has not been installed into the user's browser or published.

## 2026-10-17 - Local communication speaker candidate (not pushed)

Added an optional, default-off Speakers section between general settings and Scan. Graphics Quality stays in general settings. Speaker, Speaker voice, Find speakers and Test speaker remain visible but disabled/skipped while off; on uses the same Spacebar/Return and Auto Scan controller. A Cancel-first spoken guard protects the one-time native browser permission prompt. Browser-only operation was explicitly chosen; native Windows/Chrome voices stay in the original default-output path.

Added ten Kokoro voices (14 total). Cycling Speaker or Speaker voice auditions the
selection on that output; Test speaker repeats the same warmed/cacheable sample.
Scan feedback remains private. Obsolete voice preparations are skipped, rapid
changes cancel pending samples, and leaving Settings stops its preview. Turning
mode off terminates the worker/model. All 14 real voices generated successfully;
new preview generation measured 286–550 ms on this PC after setup, before the
Bluetooth lead-in. No extra voice installation or full model per voice is needed.

Only deliberate communication is routed: Keyboard message, Phrase Board tile when the box is closed and message Speak when open, RTC Lite selections and typed messages. RTC Lite's explicit keyboard-entry announcement also follows the public route. Private scan speech remains native. Each generated message includes the verified 750 ms silent PCM prefix. New messages, output changes and exit cancel stale work; missing speakers fail visibly with text retained and no default fallback/replay. RTC listening remains paused until real public playback completes.

Kokoro runs in a shared same-origin worker/player, warms when enabled, and uses hardware WebGPU where usable (q8 WASM otherwise). The bounded message cache is memory-only. Runtime code is pinned and vendored with notices and hashes; model downloads use the upstream revision selected by that runtime. CPU latency is materially slower. Local Chrome measurement: setup 10.1 s, new short sentence 881 ms, repeat 5 ms, before the 750 ms lead-in. No other-hardware performance claim.

Changed files (scope / Electron port):

- `bennyshub/index.html` — WEB UI / NOT PORTED: independent Speakers section, disabled-off controls, scan refresh, permission guard, app-close cancellation.
- `bennyshub/shared/communication-channel.js` — WEB SHARED / NOT PORTED: owned audio tickets, sink verification, silent prefix, cancellation and cleanup.
- `bennyshub/shared/communication-speech.js` — WEB SHARED / NOT PORTED: platform settings, parent/iframe service, devices, worker preparation and lifecycle.
- `bennyshub/shared/communication-settings.js` — WEB UI / NOT PORTED: existing-scan controls, voice readiness and permission setup.
- `bennyshub/shared/communication-worker.js` — WEB RUNTIME / NOT PORTED: local synthesis, chunking, hardware acceleration, cache and warm-up.
- `bennyshub/apps/tools/keyboard/app.js` and `index.html` — WEB APP / NOT PORTED: message-only routing and visible status.
- `bennyshub/apps/tools/phraseboard/index.html` and `board-live.js` — WEB APP / NOT PORTED: message/closed-box tile routing; open-box composition retained.
- `bennyshub/apps/tools/rtc-lite/index.html` and `app.js` — WEB APP / NOT PORTED: public routing, actual completion for listening, existing footer status and cleanup.
- `bennyshub/service-worker.js` — WEB ONLY / NOT PORTED: v48 shell scripts; optional voice runtime caches only on use.
- `bennyshub/shared/communication-vendor/kokoro.web.js`, `ort-wasm-simd-threaded.jsep.mjs`, `ort-wasm-simd-threaded.jsep.wasm` — WEB VENDOR / NOT PORTED: unmodified pinned runtime.
- Vendor `KOKORO-LICENSE.txt`, `TRANSFORMERS-LICENSE.txt`, `ONNX-LICENSE.txt`, `PHONEMIZER-LICENSE.txt`, `ESPEAK-COPYING.txt`, `THIRD-PARTY-NOTICES.txt`, `SOURCES.json` — WEB ATTRIBUTION / NOT PORTED.
- `tests/communication-channel.test.cjs`, `tests/communication-worker.test.cjs` and `scripts/check-communication-speaker.cjs` — WEB TESTS / NOT PORTED: lifecycle and real app/switch checks; OS-temp browser cwd.
- `developer-guide.html`, `docs/development/COMMUNICATION-SPEAKER.md`, `docs/history/DEVELOPMENT-HISTORY.md` — DOCUMENTATION / NOT PORTED: contract, measured limitations and handoff.

Verification: the final preview changes passed all 12 focused channel/worker tests and the browser integration check, including all 14 switch-selectable voices, output samples, rapid changes and cancellation on exit/off. Real synthesis passed for all 14 voices with no network failures. Earlier full validation: all 273 website unit tests passed (including nine new channel tests); all 1,142 page/asset checks passed. Real installed-Chrome model generation and latency checks passed. Browser integration passed all five communication actions, default-off restoration, device failure, Spacebar/Return and Auto Scan reachability, disabled-off scanning, and the Cancel-first permission guard. Real Chrome output enumeration found nine outputs, and explicit sink assignment plus muted playback passed for the Anker SoundCore Bluetooth output and a second output. All 11 desktop source hashes in the archived proof-of-concept manifest still match. Physical Bluetooth/headphone listening with the new browser voice remains a user check. No commit, push or deployment. Ben's live desktop app is unchanged. At the owner's request, the old desktop `tests/audio-routing-poc` was archived under `tmp/communication-speaker-backup-20261017/audio-routing-poc.zip` and removed; baseline website source backup and HEAD 8380df20d34b12867acb78dc73e8f53d453f6e0e are recorded alongside it.

## 2026-10-17 - RTC Lite natural spoken replies

The owner reported Gemini Nano returning "no replies needed yet" and "nothing specific to add" after "hello". The prompt prescribed eight fixed purposes even for greetings, and validation checked structure without rejecting task commentary. The local prompt now adapts to the exchange and asks for words the person can say aloud. AI-only validation rejects the reported placeholders and related model commentary, including during partial recovery. Saved personal phrases and natural refusals remain valid. Nano/local servers retain one bounded correction attempt; the own-key client rejects unusable output without adding paid calls. The separate Worker is not redeployed in this release.

Changed files and scope (all RTC Lite web; Electron port: NO):

- `bennyshub/apps/tools/rtc-lite/core.js` - conversational prompt and AI-only validation/recovery.
- `bennyshub/apps/tools/rtc-lite/providers.js` - generated-reply validation and targeted correction instructions.
- `tests/rtc-replies.test.cjs` - ten regressions for placeholders, natural boundaries, saved text, repair, recovery, local-server and own-key paths.
- `bennyshub/apps/tools/rtc-lite/README.md` - behavior and validation limits.
- `docs/history/DEVELOPMENT-HISTORY.md` - this release record.

Validation: all 274 website tests and 19 isolated Chromium browser checks passed. The browser fixture injects recognized "hello" through the speech callback, exercises model setup and GET / REFRESH, verifies a corrected board and selectable speech, and checks that an entirely unusable response restores saved phrases while retaining new context. No external requests, model downloads or browser errors occurred. Fixtures simulate Nano output; this does not establish actual Nano quality or microphone performance on the target device. Existing network-first asset handling fetches the updated RTC scripts on an online reload.

Release checks: public build and release audit passed (3,772 public files, no problems); all 1,142 page references passed. Publishing scope is limited to the RTC files and RTC-specific tests/documentation listed above.

## 2026-10-17 - Retire SmolLM2 and clarify mobile AI support

The owner reported freezing and stuck Thinking on their device and requested reconsidering the experimental browser model. Removed SmolLM2/WebLLM from both web and desktop RTC Lite. Existing webllm selections migrate to AI Off, with the retired ready flag cleared and saved; no cloud provider is selected automatically. Saved bio, phrases, speech preferences and credentials are retained. The active provider no longer contains the WebGPU/worker load or generation path, and rejects stale direct calls. The website service worker is v47 and no longer precaches the old AI worker/helper or caches its vendor runtime. Historical experimental source and attribution files remain available, but are not loaded by the app.

Settings now explicitly explain that Chrome Gemini Nano for websites requires supported desktop Chrome and is unavailable on Android and iPhone/iPad. Existing cloud, local server and desktop Chrome providers remain. No replacement mobile model is shipped: hardware, latency and useful varied replies need target-device evaluation. Google documents Gemma 3 270M as a candidate for narrow tasks and task-specific tuning, not complex conversation: https://developers.googleblog.com/en/introducing-gemma-3-270m/. A separate phrase-ranking design using a small sentence encoder is also a possible prototype; no performance or reply-quality claim is made.

Changed files and scope:

- Web and desktop `bennyshub/apps/tools/rtc-lite/app.js` - SHARED / DESKTOP DONE; retire picker option, migrate saved settings and clarify availability.
- Web and desktop `bennyshub/apps/tools/rtc-lite/providers.js` - SHARED / DESKTOP DONE; remove worker execution and refuse the retired provider, preserving their distinct credential paths.
- Web and desktop `bennyshub/apps/tools/rtc-lite/index.html` - COPY / DESKTOP DONE; remove the offer and explain mobile support.
- Web and desktop `bennyshub/apps/tools/rtc-lite/README.md` and `RTC-LITE-CONTEXT.md` - DOCUMENTATION / DESKTOP DONE; current provider scope and historical evidence.
- Web `bennyshub/service-worker.js` - WEB ONLY; cache v47 and retired runtime cache entries removed.
- Web `tests/rtc-provider-retirement.test.cjs` - WEB TEST; reject stale load/generation and retain Chrome setup/generation/disposal.
- Desktop `tests/rtc-lite-core.cjs` and `tests/electron-rtc-lite-load-state.cjs` - DESKTOP TESTS; retirement guard, saved-state migration and supported options.
- Web `CHANGELOG.md`, `docs/history/DEVELOPMENT-HISTORY.md` and desktop `ELECTRON-SCAN-UPGRADE.md` - HISTORY; release and parity record.

Validation: 264 website tests and 46 desktop RTC tests pass. Eleven focused browser checks cover migration, preserved preferences, reload, no external model/provider request, available choices, mobile support text and message repetition. The 390 x 844 settings capture was visually reviewed; this is a desktop browser viewport check, not real mobile hardware. Desktop isolated Electron checks pass: 9 setup/migration cases and 4 API cases. The website BYOK browser fixture passes with three synthetic provider calls and four layouts from 800 x 600 to 1366 x 900. Native Parakeet/Whisper speech files, shared scanning and native main/preload remain unchanged. No private microphone audio, new model download or paid provider request was used. Evidence and per-file backups: local workspace `tmp/rtc-retire-smollm-20261017`. Desktop source is updated; no installer rebuild is included.

## 2026-10-17 - RTC Lite desktop parity completed

The owner explicitly requested bringing missed shared RTC Lite changes into Benny's PC Hub. This authorizes this desktop pass and supersedes the earlier WEB ONLY / no desktop port status for these shared fixes. Compared the published website through 3397318 with the desktop source and selectively applied the common behavior.

Speaking from the keyboard now keeps the message and predictions for repetition, including repeated Enter selections and returning from the board. Clear and Delete remain explicit. Completed room-speech segments and delayed Whisper/Parakeet results survive subsequent app narration; capture still excludes app speech, and stopping a session rejects stale results. Recognition activity is visible. Missing Whisper files point to Load speech model; runtime failures retain their cause, and successful setup leaves no stale board warning. The board prompt asks for distinct conversational intentions, including agreement, disagreement/boundaries, uncertainty, clarification, and topic-specific alternatives. The desktop Tools description includes RTC-Convo board.

Desktop file scope / port status:

- `bennyshub/apps/tools/rtc-lite/app.js` - SHARED BEHAVIOR / DONE; retention and listening status only, keeping native provider choices and desktop credentials/profile loading.
- `bennyshub/apps/tools/rtc-lite/speech.js` - SHARED BEHAVIOR / DONE; queued audio, delayed recognition and activity display, with native Parakeet and Google speech paths retained.
- `bennyshub/apps/tools/rtc-lite/core.js` - SHARED PROMPT / DONE; distinct reply intentions.
- `bennyshub/apps/tools/rtc-lite/whisper-worker.js` - SHARED ERROR FIX / DONE; setup guidance uses desktop wording.
- `bennyshub/index.html` - DESKTOP COPY / DONE; Tools description.
- `bennyshub/apps/tools/rtc-lite/README.md` and `RTC-LITE-CONTEXT.md` - DESKTOP DOCUMENTATION / DONE; current repeat, listening and prompt behavior.
- `tests/electron-rtc-lite.cjs` - DESKTOP TEST / DONE; retained drafts, repeated Enter, held Enter, and Clear.
- `tests/electron-rtc-lite-load-state.cjs` - DESKTOP TEST / DONE; failed cached load followed by successful setup and accurate recognition status.
- `tests/rtc-lite-core.cjs` - DESKTOP TEST / DONE; replace superseded expectation that valid delayed room speech should be lost.
- `tests/rtc-lite-speech.test.cjs` - DESKTOP TEST / DONE; shared speech regressions plus native Parakeet delivery and cancellation.
- `package.json` - DESKTOP TEST COMMAND / DONE; include speech regressions in test:rtc-lite.
- `ELECTRON-SCAN-UPGRADE.md` - DESKTOP HISTORY / DONE; this record.
- Website `docs/history/DEVELOPMENT-HISTORY.md` - DOCUMENTATION ONLY; this record, no website runtime change.

Validation: 46 desktop logic/speech tests pass. Isolated Electron checks pass: 19 general UI checks using the production preload, 8 model/setup-state checks, and 4 API integration checks. The UI suite covers real switch key input, row behavior, saved settings, bio editing, native exit and six screen sizes. Model recovery uses controlled worker messages and a synthetic microphone lifecycle; API responses and speech tickets are fixtures. No real microphone audio, paid provider requests, downloads or Surface performance measurements were used in this pass. The recovered listening screenshot was visually reviewed. Hash checks confirm main.js, preload.js, RTC entry/providers/server, and the shared platform/bridge/scan/voice files remain unchanged. No installer was rebuilt; start_hub.bat launches the updated source.

Per-file backups, hashes, review diff and reports are in the local websites workspace `tmp/rtc-desktop-parity-20261017`. Desktop source is not a Git checkout. Website publication of this history is documentation only.

## 2026-10-17 - Keep RTC Lite text available for repetition

The owner requested that speaking the keyboard message retain its text so the same message can be repeated. The speak action now preserves the draft and current predictions, records each selected utterance, and explains that selecting the message again repeats it. Edit/save modes and the explicit Clear action keep their existing behavior.

Files: `bennyshub/apps/tools/rtc-lite/app.js`, `bennyshub/apps/tools/rtc-lite/README.md`, `bennyshub/service-worker.js` (cache v46), `CHANGELOG.md` and `docs/history/DEVELOPMENT-HISTORY.md` - WEB ONLY / no desktop port. Verification covers repeated speech, keyboard return, editing and Clear; publication runs the normal website release checks.

## 2026-10-17 - RTC Lite listening, context and reply variety

The owner reported a Whisper warning that remained after successful loading, delayed new context while refreshing, and suggestions with similar meanings. The owner also requested RTC-Convo board in the Hub Tools description.

Reproduced the stale footer with the prior published app even while the microphone was listening. Speech setup errors now stay in the microphone and Listening settings. Only an actual local model-file miss gets setup guidance, using the current Load speech model label. Runtime failures retain their actual message.

Reproduced lost transcripts with delayed recognition: app narration cleared already-captured audio and caused completed results to be discarded when the speech epoch changed. Capture still pauses during app speech, but already-captured segments and valid pending results survive later narration. Stopping or changing the recognition session still invalidates results. The listening panel now shows when recognition is processing recent speech.

The shared local/cloud board prompt gives all eight positions distinct conversational purposes and asks for different meanings across the whole board, including both agreement and disagreement when appropriate. It preserves optional user-selected speech, bounded JSON output, existing provider limits and the existing repair budget. The separately deployed BYOK Worker imports this shared prompt. No provider keys or real conversation were used in tests.

Validation: 262 website tests, five Worker integration tests and TypeScript checks pass. Nine focused browser checks cover missing model, successful setup, reload, recognition activity, context arriving during narration and a pending refresh, and preserving that newer context when the older refresh completes. The existing Worker browser check passes with four synthetic provider calls and four layouts from 800 x 600 to 1366 x 900. Real Whisper base.en transcribed a locally synthesized 5.62-second sample twice correctly in 6.63 and 5.68 seconds on this PC; these measurements do not establish speed or microphone quality on Ben's device. The build, public audit and page-link checks pass. Evidence: local websites workspace tmp/spheresplash-sync-20261017/rtc-*.

Files and scope:
- `bennyshub/apps/tools/rtc-lite/app.js` - WEB ONLY / status display; no desktop port.
- `bennyshub/apps/tools/rtc-lite/speech.js` - WEB ONLY / preserve captured speech and report recognition activity; no desktop port.
- `bennyshub/apps/tools/rtc-lite/whisper-worker.js` - WEB ONLY / accurate setup errors; no desktop port.
- `bennyshub/apps/tools/rtc-lite/core.js` - WEB AND BYOK WORKER / varied reply prompt; no desktop port.
- `bennyshub/apps/tools/rtc-lite/README.md` - WEB documentation; no desktop port.
- `bennyshub/index.html` - WEB ONLY / Tools description; no desktop port.
- `bennyshub/service-worker.js` - WEB ONLY / cache v45; model caches preserved.
- `tests/rtc-speech.test.cjs` - WEB tests / delayed transcription, narration, cancellation and worker errors.
- `CHANGELOG.md` - WEB release summary.
- `docs/history/DEVELOPMENT-HISTORY.md` - WEB detailed record.

## 2026-10-17 - Sphere Splash is a new concept

The owner clarified that Benny's Sphere Splash is a new concept. Its homepage badge now says New Concept, matching the SwitchedGames card, Details classification and New concepts filter. Game runtime and assets are unchanged.

Files: `index.html`, `CHANGELOG.md` and `docs/history/DEVELOPMENT-HISTORY.md` - WEB ONLY / no desktop port. Validation checks the scoped homepage badge and preserved catalog data; publication runs the existing release checks.


## 2026-10-17 - New games, desktop audio sync, listings and documentation organization

Owner authorized publishing the pending RTC Lite/BYOK and Chasing Rainbows updates, importing Pet Pals and Magic Button changes from the PC Hub, adding Sphere Splash, updating its PC Hub copy with the newer audio, and updating SwitchedGames and the NARBE House homepage. The owner also requested organizing the root development documents.

Pet Pals: copied eight changed files across the two games, with byte-for-byte verification against the PC Hub; gentler needs/reminders, spoken moments and Rush assistance. Magic Button: optional Simple High Contrast and six colors; Regular remains the default. Both web entry points retain analytics/favicons and omit the native bridge. 36 focused browser checks passed, including saves, naming, switch menus, Rush timing/help/decline and all regular/simple scenes; rendered captures reviewed.

Sphere Splash: imported the supplied game with 1,667 recorded voice clips; preserved the PC Hub's graphics integration when reconciling the newer audio/game files. Shared gameplay/assets match desktop by SHA-256 (1,738 files); the native bridge entry remains desktop-specific. New 1920 x 1080 actual-gameplay thumbnail and Bryan R. (Ben's other big brother), working in collaboration with NARBE LLC credit are present in the game and listings. 43 focused browser assertions passed for boot, menu safety, switch entry, choices waiting, pause, four graphics choices, six new decoded clips, save/reload, layout at three desktop sizes, and website listing handlers/details. All voice-index, WAV and quick simulation checks passed. No Electron runtime/installer or target-device test was run. Final catalog/browser review passed 19 checks with live Tailwind/Lucide resources: screenshot loading, credits, links, favorites, filters, mobile layout and homepage game launches. No missing local listing assets or SwitchedGames JavaScript errors.

Both catalogs contain 30 games. NARBE House now lists Sphere Splash and Chasing Rainbows alongside refreshed Pet Pals/Magic Button cards. The service-worker cache is v44. Runtime audio, licenses and thumbnails remain tracked; generated builds, private publishing records, test screenshots, local backups and dependencies remain excluded.

Six root documents moved into docs/development, docs/testing and docs/history, with a documentation index and repository map. This development-history name supersedes SCAN-UPGRADE-CHANGES.md. Links, project instructions and source-handoff references follow the new paths. Historical workstation paths are described by local-workspace labels; original evidence and backups remain outside the repository. Root README, CHANGELOG, AGENTS and LICENSE remain conventional entry points.

Validation: 257 website tests, production build, 3,772-file public audit (no problems), 1,142 local page references, 47 documentation links and the 4,211-file source handoff audit pass. Companion ZIP remains byte-identical (SHA-256 4db777db1037e3ff9fd7469211ab385302cdebf25acb116cd73d433b0bbf3eab). Prior RTC Lite tests/provider fixtures are documented in its entry; no live-provider call was added. Publication status is recorded by the resulting Git commits and workflows.

Evidence and originals: local websites workspace tmp/petpals-magicbutton-sync-20261017 and tmp/spheresplash-sync-20261017. SwitchedGames records its own file scope in CHANGELOG.md; desktop changes are recorded in ELECTRON-SCAN-UPGRADE.md.

Per-file scope for this combined website release (including the already-pending changes):
- `AGENTS.md` - WEB ONLY / no desktop port
- `CHANGELOG.md` - WEB ONLY / no desktop port
- `GRAPHICS-DESKTOP-PARITY.md` - MOVED / web documentation
- `GRAPHICS-QUALITY.md` - MOVED / web documentation
- `GRAPHICS-VALIDATION.md` - MOVED / web documentation
- `README.md` - WEB ONLY / no desktop port
- `SCAN-UPGRADE-CHANGES.md` - MOVED / web documentation
- `SCAN-UPGRADE-TESTING.md` - MOVED / web documentation
- `WEB-EXTENSION-MIGRATION.md` - MOVED / web documentation
- `bennyshub/ACCESSIBILITY.md` - WEB ONLY / no desktop port
- `bennyshub/apps/games/CHASINGRAINBOWS/LICENSE` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/README.md` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/js/app.js` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/NARBEMAGICBUTTON/css/style.css` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEMAGICBUTTON/js/scenes.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEMAGICBUTTON/js/settings.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEMAGICBUTTON/js/ui.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/css/style.css` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/js/companions.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/js/game.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/NARBEPETPALS/js/tricks.js` - WEB SYNC / already present on desktop
- `bennyshub/apps/games/games.json` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/tools.json` - WEB ONLY / no desktop port
- `bennyshub/service-worker.js` - WEB ONLY / no desktop port
- `developer-guide.html` - WEB ONLY / no desktop port
- `extension/README.md` - WEB ONLY / no desktop port
- `index.html` - WEB ONLY / no desktop port
- `scripts/README.md` - WEB ONLY / no desktop port
- `scripts/build.cjs` - WEB ONLY / no desktop port
- `scripts/prepare-github.cjs` - WEB ONLY / no desktop port
- `submission/START-HERE.md` - WEB ONLY / no desktop port
- `submission/VALIDATION.md` - WEB ONLY / no desktop port
- `bennyshub/apps/games/BENNYSSPHERESPLASH/.gitignore` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/CREDITS.md` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/DESIGN.md` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/README.md` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/bed.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/groan.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/roar.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/crowd/swell.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/goal.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/lose.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/theme.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/music/win.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/block.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/catch.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/decision.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/goal.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/move.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/pass.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/save.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/select.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/shot.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tackle.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tech.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick1.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick2.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick3.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick4.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/tick5.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/sfx/whistle.wav` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/coral_player/col_status_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_draw_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_goal_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_goal_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_goal_3.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_int_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_int_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_save_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/col_save_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pa_ot_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_block_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_break_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_kick_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_kick_3.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_loose_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_loose_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_loose_3.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_short_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/fixed/pbp_shot_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formation_blurbs/col_form_what__right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_bad_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_good_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_hold_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_them_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_1__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__beamers-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__gliders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__horns-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__monarchs-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__raiders-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-all-out-defense.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-center-attack.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-counter.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-double-sides.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-flat-line.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-left-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-mark.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-normal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/formations/col_form_us_2__stars-right-side.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/goal/pbp_goal_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/index.json` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_call/pbp_int_3_a.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intercept_team/pbp_int_3_b__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__beamers-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__gliders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__horns-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__monarchs-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__raiders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_1__stars-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__beamers-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__gliders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__horns-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__monarchs-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__raiders-stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/intro/pa_intro_2__stars-raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_catch_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/keeper_calls/pbp_parry_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_block_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_break_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_int_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_pass_4__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_shot_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_1__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_2__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__ace-marlowe.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__ash-canopy.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__benji-tide.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__bram-piston.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__brun-glacier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__cass-lumen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__dash-rivet.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__duke-anchor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__elowen-moss.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__gil-mooring.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__grom-ridge.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__hala-scree.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__hina-lagoon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__ivy-rootwell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__juno-swell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__kai-coral.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__kell-avalanche.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__keo-clamp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__lani-sprout.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__lux-pier.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__mara-kelp.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__moku-tusk.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__moxie-spanner.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__nix-cogsworth.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__nova-brightwater.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__orin-willow.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__oska-tundra.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__otto-shoal.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__pip-harbor.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__pono-wake.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rikka-bolt.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rory-reef.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rowan-glade.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__rua-ironshell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__runa-boulderback.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__sol-beacon.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__sylvie-fern.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tala-boulder.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tess-current.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__thorne-bramble.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tink-gasket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__tor-crag.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__vera-mast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__vex-flywheel.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__wes-driftwood.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__wren-thicket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__yeti-frost.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/player_calls/pbp_tackle_3__zip-sprocket.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_full_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_half_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_second_1.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_carriers/pa_second_2.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__eight.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__eleven.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__fifteen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__five.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__four.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__fourteen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__nine.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__one.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__seven.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__six.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__ten.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__thirteen.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__three.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__twelve.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__two.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_numbers/pa_score_n__zero.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/score_teams/pa_score_t__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_1__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/col_win_2__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__beamers.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__gliders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__horns.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__monarchs.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__raiders.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/team_lines/pbp_kick_2__stars.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__beamin-blast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__drain-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__ghost-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__rebound-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__slipstream.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__snooze-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__snooze-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__snooze-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__spin-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__sting-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__sting-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-beamin-blast.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-save.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-snooze-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__super-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__tough-shell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__wilt-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__wilt-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_names/pbp_tech_2__wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__ace-marlowe-spin-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__ace-marlowe-super-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__benji-tide-spin-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__brun-glacier-bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__cass-lumen-long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__cass-lumen-wilt-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__duke-anchor-drain-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__elowen-moss-long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__elowen-moss-wilt-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__grom-ridge-bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__kai-coral-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__mara-kelp-long-lob.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__moku-tusk-bruiser-bash.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__nix-cogsworth-snooze-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__nova-brightwater-wilt-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__orin-willow-wilt-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__oska-tundra-drain-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__otto-shoal-sting-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__pip-harbor-super-save.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__rikka-bolt-snooze-pass.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__rory-reef-sting-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__rua-ironshell-wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__sol-beacon-super-save.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__sylvie-fern-ghost-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__tala-boulder-snooze-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__tala-boulder-sting-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__thorne-bramble-wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__tor-crag-tough-shell.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__vera-mast-wilt-tackle.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__vex-flywheel-snooze-shot.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/audio/vo/tech_player/pbp_tech_1__zip-sprocket-slipstream.mp3` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/css/ss.css` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/index.html` - WEB ENTRY / desktop native entry preserved
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/ai.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/audio-files.generated.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/audio.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/broadcast.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/data.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/director.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/game.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/hud.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/main.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/model-data.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/models.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/modes.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/moves.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/replay.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/rig.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/save.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/sim.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/theme.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/ui.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/util.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/vendor/three-addons.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/vendor/three.min.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/voice-index.generated.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/voice-lines.generated.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/world.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/js/worldui.js` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/ablate.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build-voice-lines.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/bundle-addons.mjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/package-lock.json` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/package.json` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/build/prep-models.mjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-audio.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-browser.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-firefox-match.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-firefox-sound.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-sim.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/check-voice.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/dump-voice-cast.cjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/BENNYSSPHERESPLASH/tools/generate-audio.mjs` - SHARED / synchronized to desktop
- `bennyshub/apps/games/CHASINGRAINBOWS/.gitignore` - BOTH / existing scoped desktop changes
- `bennyshub/apps/games/CHASINGRAINBOWS/CREDITS.md` - BOTH / existing scoped desktop changes
- `bennyshub/apps/tools/rtc-lite/README.md` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/RTC-LITE-CONTEXT.md` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/THIRD-PARTY-NOTICES.txt` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/ai-generation.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/ai-worker.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/api-server.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/app.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/core.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/dictionary.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/index.html` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/providers.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/speech.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/APACHE-2.0-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/KOFFI-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/LOGLEVEL-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/ONNX-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/PARAKEET-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/SHERPA-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/TRANSFORMERS-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/TVM-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/TVM-NOTICE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/WEBLLM-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/WHISPER-LICENSE` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/manifest.json` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/ort-wasm-simd.wasm` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/ort-wasm.wasm` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/transformers.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/vendor/webllm.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/web-config.js` - WEB ONLY / no desktop port
- `bennyshub/apps/tools/rtc-lite/whisper-worker.js` - WEB ONLY / no desktop port
- `bennyshub/images/games/bennyspheresplash-20261017.png` - WEB ONLY / no desktop port
- `bennyshub/images/games/chasingrainbows.png` - WEB ONLY / no desktop port
- `bennyshub/images/tools/rtc-lite.png` - WEB ONLY / no desktop port
- `bennyshub/shared/byok-client.js` - WEB ONLY / no desktop port
- `docs/README.md` - WEB ONLY / no desktop port
- `docs/development/GRAPHICS-DESKTOP-PARITY.md` - WEB ONLY / no desktop port
- `docs/development/GRAPHICS-QUALITY.md` - WEB ONLY / no desktop port
- `docs/development/WEB-COMPANION.md` - WEB ONLY / no desktop port
- `docs/history/DEVELOPMENT-HISTORY.md` - WEB ONLY / no desktop port
- `docs/testing/GRAPHICS-VALIDATION.md` - WEB ONLY / no desktop port
- `docs/testing/SWITCH-ACCESS-TESTING.md` - WEB ONLY / no desktop port
- `workers/byok/README.md` - WEB ONLY / no desktop port
- `workers/byok/package-lock.json` - WEB ONLY / no desktop port
- `workers/byok/package.json` - WEB ONLY / no desktop port
- `workers/byok/src/assets.d.ts` - WEB ONLY / no desktop port
- `workers/byok/src/rtc.ts` - WEB ONLY / no desktop port
- `workers/byok/src/setup-client.txt` - WEB ONLY / no desktop port
- `workers/byok/src/setup.html` - WEB ONLY / no desktop port
- `workers/byok/src/setup.ts` - WEB ONLY / no desktop port
- `workers/byok/src/util.ts` - WEB ONLY / no desktop port
- `workers/byok/src/vault.ts` - WEB ONLY / no desktop port
- `workers/byok/src/worker.ts` - WEB ONLY / no desktop port
- `workers/byok/tests/browser.mjs` - WEB ONLY / no desktop port
- `workers/byok/tests/fixture.mjs` - WEB ONLY / no desktop port
- `workers/byok/tests/worker.test.mjs` - WEB ONLY / no desktop port
- `workers/byok/tools/initialize-vault.mjs` - WEB ONLY / no desktop port
- `workers/byok/tsconfig.json` - WEB ONLY / no desktop port
- `workers/byok/worker-configuration.d.ts` - WEB ONLY / no desktop port
- `workers/byok/wrangler.jsonc` - WEB ONLY / no desktop port


## Chasing Rainbows credits and public listings — 2026-10-17 (LOCAL ONLY)

- Apply the rightsholder’s requested public credit, approved home URL and social handle to README.md, CREDITS.md, LICENSE, NOTICE.md and js/app.js. Spoken credits include the copyright and attribution; the creator website is a switch-reachable choice.
- Preserve MIT for NARBE’s implementation and the separate rights in original game content, artwork, branding and Nunito. Record the supplied no-code licensing choice and selected publishing scope; keep the signed form private.
- Add Chasing Rainbows to bennyshub/apps/games/games.json and its missing bennyshub/images/games/chasingrainbows.png thumbnail. Refresh the existing PC Hub manifest entry and match its game notices/credits (Electron port flag: applied for these requested game-specific changes only). Gameplay and shared scan behavior are unchanged.
- Add the game-local .gitignore; exclude rights and publishing folders in scripts/build.cjs and scripts/prepare-github.cjs. Build includes the game README with its existing public notices.
- Prepare SwitchedGames index.html and README.md with the same requested attribution, existing hosted thumbnail and canonical game URL. Update its catalog counts and multiplayer classification.
- Validation: headless checks pass for exact visible credits, native/browser creator links, switch selection and Back focus in both game editions; catalog search, multiplayer filtering, details, links and favorites pass. Both manifest game/image paths resolve. The staged build, 2,019-file release audit and 1,080 link checks pass; private-folder sentinel files are excluded. These are Node DOM checks, not rendered-pixel, speech-hardware or physical-switch tests.
- No push or deployment. The owner will publish from the website workspace. Existing unrelated local website edits are preserved.

# Web scan implementation and Companion 1.0.8

## Chasing Rainbows Action prompts and legend explanations — 2026-10-15

Scope: follow-up creator feedback for both web and Benny's PC Hub. The existing engine already offers every eligible Cloud holder a response, but the old default UI preference silently allowed Actions involving other players. Always ask is now the default; unversioned legacy affects settings migrate once. Never ask is preserved, as are quieter choices made under the new settings version. All choices remain untimed CHOICE scans; scanner behavior and the engine's turn rules are unchanged.

Fog Skip was verified after draws and combos with 2–6 players in Full/Lite, including hands over seven. The one-off report before discarding was not reproduced. Once a discard is committed, only further discards are legal; the turn instructions, Discard row and How to Play now explain that Actions come first. Day/Night card descriptions and first-draw tips now include Storm Shuffle as well as Wind Trade and pairing, preserving Night's last-card winning discard exception.

Changed game files (BOTH / PORTED): js/app.js, js/cards.js, js/words.js, js/menus.js, README.md, README-ACCESSIBLE.md, SPEC.md, tests/actions.test.cjs, tests/actions-dom.cjs, tests/october14-dom.cjs (shared test harness). Web-only: SCAN-UPGRADE-CHANGES.md. Desktop-only: ELECTRON-SCAN-UPGRADE.md. Desktop-specific differences are preserved by applying the web diff to the existing desktop files. No manifest, private feedback, licensing, shared scan controller or installer change.

Validation: 69 game checks and 257 website tests pass. Nine new focused rules/menu/narration checks cover Full/Lite action eligibility and 3–6-player blocking. Sixteen new actual-page Node DOM scenarios cover all four Actions involving CPUs, default and migrated settings, deliberate quieter settings, shared-switch privacy and Auto Scan, canceling a discard confirmation, and spoken Day/Night tips. The eight prior October 14 switch scenarios also pass. Desktop checks and website packaging results are saved with the installation evidence. Node DOM testing does not verify pixels, real speech, or physical switches; no browser or Electron process was launched.

Evidence and backups: [local websites workspace]/tmp/chasingrainbows-actions-20261015/.


## Chasing Rainbows licensing clarification — 2026-10-15

Scope: owner requested explicit open-source-code versus retained game/artwork rights in the README and license notices. No gameplay or scanner changes. NARBE's original implementation remains MIT; artwork, protected third-party rule wording (including embedded text), branding and reference materials are excluded, and Nunito keeps its OFL license. Existing Inclusive Imagination LLC and Adam M Botsford credits are preserved. The notices do not claim exclusive copyright in abstract concepts/methods of play or establish that a rightsholder agreement has been signed.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/CHASINGRAINBOWS/README.md | BOTH / PORTED | Prominent code/content ownership table and links. |
| bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md | BOTH / PORTED | Specific content exclusions, attribution, font and permission-status explanation. |
| bennyshub/apps/games/CHASINGRAINBOWS/LICENSE | BOTH / PORTED | Local MIT code license with clearly separated third-party content scope. |
| README.md | WEB-ONLY | Repository overview points to the game's separate content terms. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY | This record. |
| ELECTRON-SCAN-UPGRADE.md | DESKTOP-ONLY | Matching documentation record. |

Validation: reviewed local notice links and code/content boundaries; build, Pages checks and the existing Companion license guard verify the documentation packaging. The root/Companion license text, game code, manifest and private CHanges-October14 feedback are unchanged. No Electron runtime or installer work. Form drafts and backups remain outside the repository at [local websites workspace]/Game Submission Permission Draft/ and [local websites workspace]/tmp/game-permissions-20261015/.


## Chasing Rainbows October 14 feedback — 2026-10-15

Scope: owner requested these fixes in both the website and Benny's PC Hub. This explicitly authorizes this game's desktop pass. Four named presets now show the requested complexity labels; House Rules remains a custom setup. New games win after their required combos with no Legends and at most seven cards in hand. Both Race presets draw, play combos and pass chosen cards to the next seat on the right. Passes are mandatory while holding cards, with extra passes to reach seven; empty piles skip the draw. New pass choices use the existing CHOICE scanner, hand-card highlights, row Back, optional confirmation and private handoff inbox. Help, AI, display events and the desktop catalog description follow the new rules. Existing saves keep their stored original rules and announce that on Continue.

Changed files in CHASINGRAINBOWS (WEB + ELECTRON, port applied): js/engine.js, js/ai.js, js/menus.js, js/words.js, js/display.js, js/table.js, js/app.js, css/style.css, README.md, README-ACCESSIBLE.md, SPEC.md, tests/rules.test.cjs, tests/menus.test.cjs, tests/display.test.cjs, tests/sim.test.cjs, tests/dom-smoke.cjs, tests/october14.test.cjs, tests/october14-dom.cjs. Desktop-only: bennyshub/apps/games/games.json (this game's description), ELECTRON-SCAN-UPGRADE.md (this entry). Web-only: SCAN-UPGRADE-CHANGES.md (this entry). The owner's CHanges-October14 feedback file is retained verbatim. Desktop/web-specific layouts and entry scripts are preserved. The web game remains direct-link only.

Validation: 60 game checks pass, including 18,000 seeded games across four presets, five player counts and three CPU skills, plus 600 Hard/Easy matches (70% Hard wins). Eight focused Node DOM scenarios cover setup labels, four immediate-win flows, nested pass Back/confirmation, forced passes, save/resume, private handoffs, Auto and original saves. The 257 website tests and website build pass. No browser or Electron process was launched; real rendering, audible speech and physical switch checks remain for the target setup. Desktop source verification is recorded with the installation evidence. The owner subsequently authorized the website push on 2026-10-15, keeping Chasing Rainbows out of games.json and excluding the local CHanges-October14 feedback file from Git. .gitignore records that exclusion (WEB-ONLY). No desktop installer build is included. Optional printed-card play-along remains future work.

Backups, detailed logs and installation evidence: [local websites workspace]/tmp/chasingrainbows-october14-20261015/.


## Prediction row speech refresh — 2026-10-14

The owner requested this fix in both the desktop PC Hub and the F-drive website project. Selecting a predicted word could return to row mode before the asynchronous suggestions finished, leaving the old row speech playing after the buttons changed. Prediction rows now suppress their superseded label while refreshing and announce the newly rendered suggestions through the scanner's owned speech ticket if that row still has focus. Request versions reject late results; navigation away retains speech ownership. The shared scan controller, Companion package, input guards, parking and brake policy are unchanged.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/tools/keyboard/app.js | BOTH / PORTED | Refresh current word-row speech; desktop also covers its letter predictions. |
| bennyshub/apps/tools/journal/app.js | BOTH / PORTED | Announce the completed current prediction row and ignore older requests. |
| bennyshub/apps/tools/streaming/keyboard_integration.js | BOTH / PORTED | Refresh after selecting a suggestion; invalidate closed/older requests. |
| bennyshub/apps/tools/streaming/app.js | BOTH / PORTED | Own the refreshed row announcement and its speech wait. |
| bennyshub/apps/tools/phraseboard/board-choice.js | BOTH / PORTED | Stable suggestion-row identity, live labels in grid/free layouts, and parent restoration after redraw. |
| bennyshub/apps/tools/ytsearch/js/app.js | WEB-ONLY / NATIVE SEARCH SEPARATE | Version scheduled predictions and notify scanning after rendering. |
| bennyshub/apps/tools/ytsearch/js/scanning.js | WEB-ONLY / NATIVE SEARCH SEPARATE | Announce the current visible prediction row through the scan adapter. |
| Desktop: bennyshub/apps/tools/search/app.js | DESKTOP-ONLY / DONE | Refresh history/API prediction speech, reject outdated responses, and retain the prediction row during loading. |
| Desktop: bennyshub/apps/tools/messenger/keyboard.js | DESKTOP-ONLY / DONE | Refresh word, phrase and common-word speech; independent row request ownership and immediate completed-result announcements. |
| Desktop: bennyshub/apps/tools/rt-convo/index.html | DESKTOP-ONLY / DONE | Keep the selected word/phrase row during loading, reject stale results and announce current suggestions. |
| Desktop: tests/prediction-row-speech.cjs | BOTH VERIFIED / TEST IN DESKTOP | Real-page/component regression runner, including unchanged Music Maker behavior. |
| SCAN-UPGRADE-CHANGES.md | WEB DOCUMENTATION / NO PORT | Record this audit and validation. |

Validation: 35 targeted Electron browser/component checks passed across the eight desktop prediction surfaces and five website surfaces. These cover word/phrase/letter/common-word rows, delayed and out-of-order replies, navigation away, empty results, Phraseboard grid/free groups, and Auto Wait for Speech ownership plus a full interval. The untouched desktop Keyboard backup fails the new regression on its old row announcement. Existing desktop scan/adapter/prediction tests passed. All 257 website unit tests, the website build, 1,078 page/link checks, and the 2,015-file release audit passed. The seven built website JavaScript files match the reviewed source hashes. The test uses controlled prediction responses and speech completion tickets; physical switches and audible voice output were not tested. No website publication was performed.

Originals and reports: the desktop workspace's tmp/prediction-speech-20261014/ (before/desktop, before/web, report.json, baseline-report.json, web-manifest.json). The regression entry runs through tools/run-electron-test.cjs, which creates and disposes an absolute OS-temporary working directory. Music Maker already awaited predictions before its row return and required no change.

## SwitchedGames logo refresh — 2026-10-13

Use the owner-supplied connected-halves logo with larger button circles in both NARBE House links to SwitchedGames. New references use the new filename; the legacy image URL also serves the new artwork.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| index.html | WEB-ONLY / NO PORT | Point both SwitchedGames images to logos/switchedgames-logo.svg. |
| logos/switchedgames-logo.svg | WEB-ONLY / NO PORT | Add the exact supplied SVG. |
| logos/switchedgames_emblem_v5.svg | WEB-ONLY / NO PORT | Serve the new SVG at the legacy URL for existing consumers. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record scope and verification. |

Validation: the web build, 1,078 page/link checks, and public-file audit passed. Both logo references load the new SVG in Chromium; source, legacy, and built SVGs match the supplied file byte for byte. Full House layout verification is limited by blocked Tailwind/Lucide CDN access in the local browser. Original changed files are backed up in ../tmp/switchedgames-logo-20261013/before/narbehouse/. Related updates cover SwitchedGames and NARBE Foundation. The owner approved publication on 2026-10-13. No Electron port.

## Chasing Rainbows phone layout — 2026-10-13

The owner requested a mobile layout fix while keeping the working PC/tablet design. Phone widths up to 600px, plus short landscape viewports up to 960px wide and 500px high, now use a vertically scrolling game and menu overlay. Cards use a non-overlapping touch grid; seats, rainbow progress, choices, values and long labels wrap. Table piles size from width and played combos grow the felt instead of collapsing a size-contained table. Menus retain the chosen text size instead of shrinking to 60%; safe-area padding and dynamic viewport height accommodate phone browser chrome. Pause remains reachable, with scroll clearance beneath it. Highlighted choices and Look answers reveal themselves within the scrolling page. Existing scan identities, timing, gameplay and tablet/desktop CSS are retained.

Backup: [local websites workspace]/Website Backups/ChasingRainbows-before-mobile-2026-10-13. The owner authorized pushing this update for collaborator testing through the existing direct link. Chasing Rainbows remains absent from games.json, and no catalog image is added. The Hub game catalog, shared modules, desktop application and existing release archives are unchanged.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/CHASINGRAINBOWS/css/style.css | WEB-ONLY / NO PORT | Add the phone breakpoint, scrolling/safe-area layout, wrapping cards and controls, and readable menus. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/app.js | WEB-ONLY / NO PORT | Bypass whole-menu scaling on phones; reset new menu scroll, retain in-place settings scroll, and reveal scan choices/Look answers. |
| bennyshub/apps/games/CHASINGRAINBOWS/README-ACCESSIBLE.md | WEB-ONLY / NO PORT | Document the phone layout and automatic focus scrolling. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record the change and verification limits. |

Validation: all 46 existing game checks and 257 website checks passed. Node/jsdom navigation checks passed with desktop and phone layout flags: settings, menu resize transitions, in-place scroll retention, all five Look answers, row Back, row-title/dimmed-menu/pointer navigation, pause/settings/resume, and a six-player game at 150% text size including hand-card focus and row Back. JavaScript syntax and CSS parsing passed; the pre-existing CSS remains byte-for-byte unchanged before the appended phone rules. The web build, 1,017 page/link checks, and 1,937-file public audit passed. Built game CSS and JavaScript match source. Evidence: ../tmp/chasingrainbows-mobile/.

Visual layout, CSS media-query rendering, real touch, speech and switch hardware remain unverified. jsdom does not render layout; its phone flag exercises the app's responsive behavior only. No browser was launched on this PC, following the game's README. Device review should cover 320–430px portrait widths, short landscape, long settings/Look answers and six-player games at 150% text size.

## Chasing Rainbows Look navigation update — 2026-10-12

The owner requested publication of the latest local game update. Look answers now appear in a large-print callout and return focus to Look in the turn menu; mouse/touch can return through the row title or dimmed turn menu, and choosing a different row item retains its parent navigation. The game remains direct-link only, with the existing Hub manifest byte-for-byte unchanged. No shared module or Electron application is changed.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/CHASINGRAINBOWS/js/app.js | WEB-ONLY / NO PORT | Publish the supplied Look answer, row visibility and pointer-navigation changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/css/style.css | WEB-ONLY / NO PORT | Publish the supplied answer callout, emphasis and row-title styling. |
| bennyshub/apps/games/CHASINGRAINBOWS/README-ACCESSIBLE.md | WEB-ONLY / NO PORT | Document Look return behavior and mouse/touch navigation. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/dom-smoke.cjs | WEB-ONLY / NO PORT | Publish the supplied checks for visible Look choices, answer feedback and return navigation. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record the update and publication validation. |

Validation: all 46 game checks pass. A focused Node/jsdom check exercises all five Look answers, row Back, row-title Back, dimmed-menu Back, pointer selection of an unhighlighted Look item and pause/settings/resume, with no script errors. Build, 1,017 page/link checks and the 1,937-file public audit pass. The source and built game manifests match the original SHA-256 a6671526c2c89a8f1f47be2f0f3b1debc0c8463b9682ba4da8b0df174b71c2a8. Visual rendering, real speech and switch hardware were not exercised on this PC, per the game README. Focused check evidence: ../tmp/chasingrainbows-look-release/. Prior public version: c8ab8fda86fa201f9e4c01087b8a345d419dea7d.

## Chasing Rainbows creator review release — 2026-10-12

The owner explicitly requested publishing Chasing Rainbows for creator testing at a direct Benny's Hub link, without adding it to the manifest. The game remains absent from the Hub catalog and SwitchedGames listing. The game is publicly reachable at its direct URL; noindex/nofollow discourages indexing and is not access control. All creator credits and ownership restrictions remain intact. Original partner reference documents and artwork stay local. No desktop application or shared scan/speech module is changed.

Direct URL: https://narbehouse.github.io/bennyshub/apps/games/CHASINGRAINBOWS/index.html

Backup: [local websites workspace]/Website Backups/ChasingRainbows-before-web-2026-10-12. Baseline commit: 1a8433ca420ef20c704967d1ffa96239d3337819. The existing games.json remains byte-for-byte unchanged (SHA-256 a6671526c2c89a8f1f47be2f0f3b1debc0c8463b9682ba4da8b0df174b71c2a8).

| File | Scope / Electron status | Change |
| --- | --- | --- |
| .gitignore | WEB-ONLY / NO PORT | Exclude original partner reference documents and art from Git. |
| scripts/build.cjs | WEB-ONLY / NO PORT | Exclude the local REFERENCE DATA folder from the public build. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record the direct-link publication scope and checks. |
| bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md | WEB-ONLY / NO PORT | Retain creator ownership/reuse notices and record the authorized creator review release. |
| bennyshub/apps/games/CHASINGRAINBOWS/README-ACCESSIBLE.md | WEB-ONLY / NO PORT | Preserve the existing game and accessibility documentation. |
| bennyshub/apps/games/CHASINGRAINBOWS/README.md | WEB-ONLY / NO PORT | Preserve the existing game and accessibility documentation. |
| bennyshub/apps/games/CHASINGRAINBOWS/SPEC.md | WEB-ONLY / NO PORT | Retain the game design history and record the direct-link review authorization. |
| bennyshub/apps/games/CHASINGRAINBOWS/css/style.css | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/fonts/Nunito.ttf | WEB-ONLY / NO PORT | Ship the existing local font and its license. |
| bennyshub/apps/games/CHASINGRAINBOWS/fonts/OFL.txt | WEB-ONLY / NO PORT | Ship the existing local font and its license. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/back.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/blue.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/cloud.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/day.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/double.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/fog.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/green.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/indigo.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/night.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/orange.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/rain.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/red.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/storm.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/sun.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/violet.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/wild.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/wind.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/img/cards/yellow.webp | WEB-ONLY / NO PORT | Ship the existing optimized card artwork. |
| bennyshub/apps/games/CHASINGRAINBOWS/index.html | WEB-ONLY / NO PORT | Add the web entry, noindex/nofollow metadata, and omit the unavailable desktop electron bridge. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/ai.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/app.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/audio.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/cards.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/display.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/engine.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/fx.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/menus.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/narrator.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/sky.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/table.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/js/words.js | WEB-ONLY / NO PORT | Ship the existing game code/styles without gameplay or control changes. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/card.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/chime.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/fog.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/night.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note0.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note1.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note2.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note3.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note4.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note5.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note6.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/note7.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/pop.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/puff.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/rain.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/shuffle.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/slam.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/sparkle.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/thunder.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/turn.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/sound/whoosh.wav | WEB-ONLY / NO PORT | Ship the existing game audio. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/display.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/dom-smoke.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/menus.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/rules.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/sim.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tests/sky.test.cjs | WEB-ONLY / NO PORT | Preserve the existing game verification harness. |
| bennyshub/apps/games/CHASINGRAINBOWS/tools/make-card-art.py | WEB-ONLY / NO PORT | Preserve local asset-generation source; excluded from the public build. |
| bennyshub/apps/games/CHASINGRAINBOWS/tools/make-sounds.py | WEB-ONLY / NO PORT | Preserve local asset-generation source; excluded from the public build. |

Validation: 46 existing game checks and 257 website checks passed. The web build passed, 1,017 case-sensitive page/link checks passed, and the 1,937-file public release audit reported no problems or findings. The existing Companion ZIP hash remains unchanged. The focused switch-navigation integration run passed every menu, nested settings, pause, main-menu save/resume, Look/Back navigation and a complete game to results with no script errors. The remaining long-running scenarios were stopped after this coverage; the full seven-scenario suite was not completed. Browser rendering was not exercised on this development PC, per the game README.

## Legal-page publication authorized — 2026-10-10

The owner explicitly instructed "ok push" after reviewing the local privacy/terms work, superseding the earlier local-only restriction. Publish the current generic notices and confirmed LLC operator/privacy contact through the existing main-to-Pages workflows. Outstanding provider/form settings and legal applicability remain documented in the private review; approval does not verify them. No tracking/consent settings or game/scan/speech/Electron behavior is changed.

Resolve the build's license dependency by keeping the byte-identical released license in extension/LICENSE. Only the separate branding paragraph may differ from the current website LICENSE; any other license change fails packaging. Existing immutable destinations are verified and skipped instead of rewritten. The active Companion ZIP/version, runtime, permissions, setup references and checksums remain unchanged.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| extension/LICENSE | BUILD INPUT / WEB-ONLY / NO PORT | Exact reviewed Companion license snapshot, preserving the released package bytes. |
| scripts/companion-license.cjs | BUILD / WEB-ONLY / NO PORT | Permit only the separate branding paragraph to differ; fail other license changes. |
| scripts/package-companion.cjs | BUILD / WEB-ONLY / NO PORT | Use the validated snapshot; avoid rewriting already-verified immutable files. |
| tests/companion-license.test.cjs | TEST / WEB-ONLY / NO PORT | Cover branding-only changes, grant/disclaimer changes, malformed input and reviewed snapshot hash. |
| README.md, CHANGELOG.md, SCAN-UPGRADE-CHANGES.md | DOCUMENTATION / WEB-ONLY / NO PORT | Explain snapshot maintenance and record publication authorization. |
| ../SWITCHEDGAMES/CHANGELOG.md | DOCUMENTATION / WEB-ONLY / NO PORT | Record the owner's publication instruction. |

Pre-publication uncommitted files backed up and hash-verified outside the websites at [local websites workspace]/Website Backups/Legal-publication-2026-10-10-1791680815715. Its release baseline records 1,657 existing release/download files and timestamps. The original legal-page backup and fact table remain at [local websites workspace]/Website Backups/SwitchedGames-legal-2026-10-10-1791679705308.

Validation before push: 257 Node tests pass; build succeeds; 994 page/link checks pass; public release audit covers 1,881 files with no problems/findings. The active Companion ZIP matches the submitted SHA-256; all 1,657 pre-existing release/download files retain their bytes and timestamps. The 201 legal-page browser checks remain applicable to unchanged HTML/CSS.

## SwitchedGames privacy, terms and branding — 2026-10-10

Local review only. This request does not authorize publication, regardless of prior approvals recorded below. Preserve graphics/audio changes, game behavior, shared scan/speech code, Electron applications and existing release archives. No Electron port.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| index.html | WEB-ONLY / NO PORT | Add SwitchedGames names and a separate policy pointer outside the unchanged mirrored privacy text. |
| bennyshub/index.html | WEB-ONLY / NO PORT | Narrow SwitchedGames branding and third-party/contributor ownership clarification only. |
| crypto-statement/index.html | WEB-ONLY / NO PORT | Matching narrow branding clarification. |
| LICENSE | WEB-ONLY / NO PORT | Add SwitchedGames name variants in the separate branding note; preserve license grants. |
| README.md | WEB-ONLY / NO PORT | Matching SwitchedGames branding reference. |
| CHANGELOG.md | WEB-ONLY / NO PORT | Record the local legal/branding change. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NO PORT | Record every changed source file and related-site scope. |
| ../SWITCHEDGAMES/privacy.html, terms.html, legal.css | WEB-ONLY / NO PORT | New readable static legal pages; no Analytics, fonts API, widget or automatic notice script. |
| ../SWITCHEDGAMES/index.html, aboutus.html, crypto-statement/index.html | WEB-ONLY / NO PORT | Add accessible Privacy Policy and Terms of Use footer links and align structured publisher metadata with the owner-confirmed LLC operator; existing integrations unchanged. |
| ../SWITCHEDGAMES/CHANGELOG.md | WEB-ONLY / NO PORT | Record related-site changes. |

Backup originals verified with SHA-256 before editing: [local websites workspace]/Website Backups/SwitchedGames-legal-2026-10-10-1791679705308. Review evidence, fact table, validation and publication blockers are outside the published trees in its review directory. Both working trees were clean at the recorded baseline.

Source-license branding is also bundled by scripts/package-companion.cjs into the immutable active Companion candidate. The build's byte-comparison guard must remain intact; no release ZIP, generated dist output, extension permission or shared privacy disclosure is edited by hand. See the external review report for the actual build result and required publication follow-up.

## Website publication approval — 2026-10-10

After local testing and the High/Low fidelity review, the owner explicitly approved pushing the website. Publish the complete web change through the existing main → GitHub Pages workflow. The shared manager, service-worker cache v39, all 13 web profiles and future-game framework requirements are included. Desktop source remains local; no desktop installer or Companion store submission is included. Deployment success must be confirmed from the Actions run and live site.

Publication-record changes: GRAPHICS-QUALITY.md, GRAPHICS-VALIDATION.md, GRAPHICS-DESKTOP-PARITY.md and SCAN-UPGRADE-CHANGES.md (DOCUMENTATION / NO RUNTIME PORT). Existing local validation remains 253 passing Node tests, a successful build, 978 clean page/link checks and a clean 1,879-file public audit.

## High/Low fidelity review — 2026-10-10

Owner-requested comparison against the verified pre-graphics source, especially NARBE Racer. Native Racer's fresh High menu and race match the original scene/material/light signatures, color pipeline, drawing-buffer dimensions and four-sample antialiasing. Switching from Auto/Low to High in an existing renderer retains its original no-MSAA context until the game is reopened; the setting's full-change-next-launch indication remains intentional and avoids restarting a round. High's geometry and art have not been reduced. Low reduces drawing-buffer size and disables launch MSAA without changing race geometry or gameplay.

One fidelity correction: Bowling's High mode now preserves its original uncapped display density. The shared default cap of 2 had reduced resolution on displays above 2×. Low retains the 921,600-pixel budget. The game registration is covered by a regression check at 1×, 1.5×, 2× and 3×, including Low-to-High restoration.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js | RENDERING / DESKTOP IMPLEMENTED | Preserve original display density on High; shared Low cap retained. |
| tests/graphics-quality.test.cjs | TEST / DESKTOP IMPLEMENTED | Exercise the real Bowling registration and High/Low density contract. |
| GRAPHICS-QUALITY.md | DOCUMENTATION / DESKTOP IMPLEMENTED | Record Bowling's original uncapped High resolution. |
| GRAPHICS-VALIDATION.md | VALIDATION / DESKTOP RESULTS REFERENCED | Current test totals and fidelity evidence. |
| bennyshub/service-worker.js | WEB CACHE / NO DESKTOP PORT | v39 invalidates the preceding local experiment cache. |
| SCAN-UPGRADE-CHANGES.md | WEB RECORD / NO RUNTIME PORT | Record this fidelity audit and exact scope. |

Desktop audit evidence and source checkpoints: tmp/graphics-quality-audit-20261010/. Its native rendering audit checks High → Low → High restoration, fresh Low MSAA, pixel budgets, shadows, Basketball reflections/bloom and P3GL post-processing across all 13 desktop Three.js games. Source inspection also confirms Baseball's High uses its original maximum 3× canvas scale. These checks establish rendering fidelity and reduced GPU work; low-end-device FPS remains a user acceptance check. Nothing pushed, deployed or packaged.


Validation completed: 13/13 native Three.js fidelity profiles pass with actual draws after each change; Racer menu/race comparisons pass; Bowling's 3×-display regression is reproduced and corrected (original/new High 2400×1800, prior High 1600×1200, Low 800×600 in an 800×600 CSS viewport). Racer original versus High race captures differ in only 29 pixels out of 1,890,672, by at most one channel value out of 255. Focused desktop Node checks: 31/31. Web Node checks: 253/253; local build, 978-page checks and 1,879-file release audit pass. Reports include all-games-report.json, racer-report.json, racer-race-report.json and bowling-density-report.json in the audit directory.

## Universal graphics: Auto, High, Standard, Low — 2026-10-10

The user clarified that the universal setting must exist in both desktop and web, then specified Auto, High, Standard and Low. That explicit request authorized the desktop work after the initial web-only phase. Both source trees are implemented locally; no push, deployment or installer build occurs before user testing.

Auto is the fresh default and measures each actual renderer's frames, reduces detail after sustained slow rendering, and cautiously retries higher detail with hysteresis/backoff. Manual High, Standard and Low and per-game inheritance are supported; existing Lightweight migrates to Low and explicit legacy High/Low to those named choices. Gameplay clocks, physics, input and speech are preserved. Shared runtime details and hardware limits are in GRAPHICS-QUALITY.md.

The web has 13 profiles; desktop has the same 13 plus its catalog-only Sphere Splash. Desktop uses production preload/IPC, isolated per-key persistence in userData and authoritative async startup for every renderer. Native differences were selectively retained. The table below records the original web file scope with its updated desktop disposition. Desktop-specific files and final test results are recorded in its ELECTRON-SCAN-UPGRADE.md. Four-mode verification supersedes the earlier 247-test/two-mode snapshot; current outcomes are in GRAPHICS-VALIDATION.md. Pi performance and user acceptance remain pending.

| File | Scope / Electron status | Change |
| --- | --- | --- |
| AGENTS.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| GRAPHICS-DESKTOP-PARITY.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| GRAPHICS-QUALITY.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| GRAPHICS-VALIDATION.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| SCAN-UPGRADE-CHANGES.md | WEB RECORD / NO RUNTIME PORT | This file-level implementation and test record. |
| bennyshub/ACCESSIBILITY.md | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| bennyshub/apps/games/BENNYSBALLISTA/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBALLISTA/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSBALLISTA/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/BENNYSBASEBALL2/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBASEBALL2/js/game.js | SHARED RENDERING/SETTINGS / DESKTOP IMPLEMENTED | Display-density profile, canvas settings/status and pause layout; retain logical world/input coordinates. |
| bennyshub/apps/games/BENNYSBASEBALL2/js/rendering.js | SHARED RENDERING/SETTINGS / DESKTOP IMPLEMENTED | Display-density profile, canvas settings/status and pause layout; retain logical world/input coordinates. |
| bennyshub/apps/games/BENNYSBASEBALL2/js/scenes.js | SHARED RENDERING/SETTINGS / DESKTOP IMPLEMENTED | Display-density profile, canvas settings/status and pause layout; retain logical world/input coordinates. |
| bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/js/arena.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Simplify crowd heads/seats and freeze decorative motion only; preserve scoreboard and random sequence. |
| bennyshub/apps/games/BENNYSBOWLING/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js | SHARED RENDERING/SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Integrate graphics settings and rendering without gameplay/input retuning. |
| bennyshub/apps/games/BENNYSDICE/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSDICE/js/game.js | SHARED RENDERING/SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Integrate graphics settings and rendering without gameplay/input retuning. |
| bennyshub/apps/games/BENNYSFISHMYSTERY/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSFISHMYSTERY/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSFISHMYSTERY/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/BENNYSPEGGLE/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSPEGGLE/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSPEGGLE/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/BENNYSRACETRACKS/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/BENNYSRACETRACKS/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/BENNYSRACETRACKS/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/css/style.css | SHARED PRESENTATION / DESKTOP IMPLEMENTED | Wrap the graphics status inside the Animal Friends settings row. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/js/stage3d.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/NARBEANIMALFRIENDS/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEKART/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEKART/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/NARBEKART/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEMINIGOLF/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEMINIGOLF/js/main.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/NARBEMINIGOLF/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/apps/games/NARBEPICKLEBALL/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/game.js | SHARED RENDERING/SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Integrate graphics settings and rendering without gameplay/input retuning. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/ROBOTFOOTBALL/index.html | WEB ENTRY / SELECTIVE DESKTOP PORT IMPLEMENTED | Load shared graphics manager after platform; retain analytics/favicons. Basketball/Baseball include renderer bootstrap/settings; Fish includes scoped label wrapping. |
| bennyshub/apps/games/ROBOTFOOTBALL/js/renderer.js | SHARED RENDERING / DESKTOP IMPLEMENTED | Renderer options, resize/adaptive caps, shadows, safe live updates and renderer-owned subscription cleanup. |
| bennyshub/apps/games/ROBOTFOOTBALL/js/ui.js | SHARED SETTINGS / SELECTIVE DESKTOP PORT IMPLEMENTED | Existing scan-adapter graphics choice, live label and stable redraw identity; scoped text fit. |
| bennyshub/index.html | WEB HUB / DESKTOP HUNKS IMPLEMENTED | Accessible Graphics quality default, live value and stable settings scan ID. |
| bennyshub/service-worker.js | WEB ONLY / NO DESKTOP PORT | Version v38 and precache shared graphics resolver; retain named-asset network-first policy. |
| bennyshub/shared/graphics-quality.js | SHARED / DESKTOP IMPLEMENTED | Public resolver, device-local precedence, migration, caps, launch-only options and disposal. |
| bennyshub/shared/platform.js | PLATFORM-SPECIFIC / DESKTOP ADAPTATION IMPLEMENTED | Expose settings readiness/disposal and final-page close lifecycle; preserve storage/speech/input behavior. |
| developer-guide.html | DOCUMENTATION / DESKTOP GUIDANCE UPDATED | Graphics integration contract, profiles, audit, recovery, verification or desktop parity guidance. |
| scripts/check-graphics-exits.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-frames.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-gameplay.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-games.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-interactions.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics-offline.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| scripts/check-graphics.cjs | WEB TEST / NATIVE SUITES ADDED | Reproducible browser graphics/settings/gameplay/lifecycle checks; isolated profiles and local artifacts. |
| tests/graphics-quality.test.cjs | WEB TEST / NATIVE SUITES ADDED | Thirteen shared-contract tests, including future-game and asynchronous adapter cases. |


## NARBE Racer: Wonder and Dream cups, set pieces, coin luck, item icons — 2026-10-10

User requested publishing the PC Hub NARBE Racer update to the website. Sixteen tracks in four cups: every track's big jump is now a full-width landscape gap (creek, canyon, moat, sea trench, tar pit, ball pit, city street, molten gear pit and more); the Wonder Cup (Jungle Falls, Floating Isles, Coral Reef, Dino Valley) and the new Dream Cup (Toy Room, Funfair, Neon City, Clockwork Factory) add loop-de-loops, steep berms, drive-through waterfalls and themed curtains (bubbles, steam, hologram, confetti), archway runs and sky islands, each with its own scenery set and theme song. Coins are now item luck: the coins a player holds at a Power Box pull the odds toward better items (more when further behind, reaching a jackpot band in last place) and are spent on the item; coin trails hop between two lanes. The HUD item slot and roulette use drawn, centred icons instead of platform emoji.

Controls, scanning, pause, menus and defaults are unchanged; every set piece is automatic. Website analytics, favicons and the scan-badge test page (`tools/ui_mock.html`) are preserved; the browser edition keeps no Electron bridge. Cups unlock in order (Sunshine, Moonlight, Wonder, Dream); Mirror keeps its original Sunshine + Moonlight condition, so saved progress is unaffected.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/NARBEKART/js/tracks.js, themes.js, world.js, spline.js, race.js, camera.js, items.js, constants.js, game.js, hud.js, ui.js, art-items.js, audio.js | SHARED / ALREADY DONE ON DESKTOP | Sixteen circuits and four cups; landscape gaps, loops, berms, curtains, archways, sky islands; coin luck and lane-hopping coin trails; six new songs; drawn HUD item icons. |
| bennyshub/apps/games/NARBEKART/js/props-gaps.js, props-wonder.js, props-wonder2.js, props-dream1.js, props-dream2.js, item-icons.js | SHARED ASSETS / ALREADY DONE ON DESKTOP | New procedural scenery, hazards, set pieces and item icons. |
| bennyshub/apps/games/NARBEKART/css/nk.css | SHARED / ALREADY DONE ON DESKTOP | Curtain wash variants and drawn-icon sizing. |
| bennyshub/apps/games/NARBEKART/index.html | SHARED / ALREADY DONE ON DESKTOP; WEB ENTRY ADAPTED | New script tags; retained website analytics and favicons, no Electron bridge. |
| bennyshub/apps/games/NARBEKART/DESIGN.md, readme.md | DOCUMENTATION / ALREADY DONE ON DESKTOP | Cups, set pieces, coins, catalog and load order. |
| bennyshub/apps/games/NARBEKART/tools/* (except ui_mock.html) | DEV TOOLS (not published) / ALREADY DONE ON DESKTOP | Track validator rules, set-piece race tests, Node scene renderer. |
| bennyshub/ACCESSIBILITY.md | WEB DOCUMENTATION / DESKTOP EQUIVALENT EXISTS | NARBE Racer row: automatic set pieces, gentle curtain wash, coin rules. |
| bennyshub/apps/games/games.json, index.html | WEB CATALOG / NOT NEEDED | Listing and homepage card mention the sixteen tracks. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | This sync record. |

Validation (Node only, no browser launched on this PC): all 16 circuits and their mirrors pass the track validator; 71 set-piece checks (full 12-kart races on every track in both rule sets and mirrored, loops, camera, coin trails); 21 race, 20 item/guidance/AI and 38-ramp jump-layout checks; audio check with every existing song and sound bit-identical; every script in the page resolves. Previous website files are backed up at `[local PC Hub workspace]/tmp/narberacer-web-sync-20261010/backup`.

## Battleboats presentation upgrade — 2026-10-08

User requested syncing the already-approved PC Hub Battleboats upgrade into the website game folder. Detailed SVG ships, shot/splash/explosion effects, five original WAV sounds, sunk-ship reveals, fleet/accuracy displays, reduced-motion and volume controls, scanned Pause and persistent results/replay are included. Automatic scenes wait for their owned speech ticket and a 650 ms trailing buffer; paused and abandoned turns cannot resume from stale callbacks.

Website analytics, favicons, existing pause-menu choices and highlight cleanup are preserved. The browser edition uses its existing shared managers and mobile audio unlocker, with no Electron bridge. No desktop files, shared managers, catalogs, existing thumbnail edits, release ZIPs or deployments are changed by this sync.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/BENNYSBATTLEBOATS/index.html | SHARED PRESENTATION / ALREADY DONE ON DESKTOP; WEB ENTRY ADAPTED | New interface and local assets; retained website metadata and browser integration. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/scripts/battleship.js | SHARED / ALREADY DONE ON DESKTOP | Reveal/shot lifecycle, pause/replay/settings, speech completion and trailing buffer; retained website-specific pause behavior. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/scripts/presentation.js | SHARED / ALREADY DONE ON DESKTOP | Ship artwork, stable fleet overlays, bounded effects, reports and SafeAudio. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/styles/command.css | SHARED / ALREADY DONE ON DESKTOP | Responsive naval presentation, effects and full mobile fleet reveal. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/scan-access.js | SHARED / ALREADY DONE ON DESKTOP | Pause/result scan choices and visible settings highlights. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/audio/hit.wav, launch.wav, miss.wav, sonar.wav, sunk.wav | SHARED ASSETS / ALREADY DONE ON DESKTOP | Original procedural sound effects. |
| bennyshub/apps/games/BENNYSBATTLEBOATS/README.md | WEB DOCUMENTATION / DESKTOP EQUIVALENT EXISTS | Features, access controls and browser validation commands. |
| scripts/generate-battleboats-audio.cjs | WEB TOOL / DESKTOP EQUIVALENT EXISTS | Reproducible original audio generator. |
| scripts/check-battleboats.cjs | WEB TEST / DESKTOP EQUIVALENT EXISTS | Headless-browser adaptation of the complete regression fixture. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | This sync record. |

Validation: 51 real-browser assertions passed with the website shared modules, including both player modes, switch navigation, paused/abandoned shots, results/replay, reduced motion, five decoded WAVs, phone layouts and delayed speech tickets. All 17 local HTML asset references resolve. The service worker does not cache this game, so its cache version is unchanged. Previous website files are backed up at `[local PC Hub workspace]/tmp/battleboats-web-sync-20261008-uaBnaY/backup`.

## Robot Pickleball default speeds — 2026-10-07

User-requested defaults: Movement is Brisk (3.4), and Ball pace is Full speed (1). Missing or invalid settings use these defaults; valid saved choices remain intact. This scoped gameplay-default update applies to both the PC Hub and website.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/NARBEPICKLEBALL/js/game.js | SHARED / DONE ON DESKTOP | Brisk/Full speed initialization and matching invalid-value fallbacks. |
| bennyshub/apps/games/NARBEPICKLEBALL/README.md | SHARED DOCUMENTATION / DONE ON DESKTOP | Document both defaults and saved-preference behavior. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | Record this authorized defaults change. |

Validation: fresh/missing, malformed and invalid stored settings initialize to Brisk/Full speed; valid saved access choices remain unchanged. All 239 web Node tests and all 10 desktop Node control checks pass. Desktop and web game source match.

## Robot Pickleball catalog and web release — 2026-10-07

The owner approved the repaired game and requested a fresh screenshot, updated descriptions in the PC Hub, web Hub and NARBEHOUSE homepage, and publication of all pending web updates. This release promotes the existing repaired Robot Pickleball build into the web catalog without changing its gameplay. The pickleballrally ID and favorites remain intact, and Lily Flack’s original stays accessible from credits. The new 1920×1080 screenshot was captured from the matching local web game in normal Chrome.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/games.json | WEB + DESKTOP / CATALOG UPDATED | Robot Pickleball title, launch path, current controls/pace description and versioned screenshot. |
| bennyshub/images/games/narbe-pickleball-2026-10.png | WEB + DESKTOP / ASSET UPDATED | Actual repaired court and serve-target screenshot. |
| index.html | WEB-ONLY / NOT NEEDED | NARBEHOUSE card uses the new game, image, description and title. |
| bennyshub/apps/games/NARBEPICKLEBALL/index.html, README.md | WEB-ONLY METADATA / NOT NEEDED | Web edition label and current launch/catalog documentation. |
| bennyshub/ACCESSIBILITY.md | WEB-ONLY REFERENCE / NOT NEEDED | Identify the preserved original as a credits link. |
| bennyshub/service-worker.js | WEB-ONLY / NOT NEEDED | Cache v36 for the updated catalog. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY RECORD / NOT NEEDED | Scope, publication and verification record. |

The release also includes the already-pending NARBEPICKLEBALL implementation/model tests and the basketball between-shot Pause changes documented below. Its legacy scripts/check-rally-club.cjs browser fixture targets the initial prototype; it was not run or used as release evidence. Validation: all 239 Node tests pass, including 25 current pickleball model tests. The Node 22.16.0 production build passes; its audit reports 1,865 public files with no findings or problems, and all 954 checked local references pass. The immutable Companion candidate retains its recorded SHA-256. Desktop and web model, game, scene and stylesheet hashes match. Electron was not launched during this catalog refresh.

## Rally Club desktop installation authorized — 2026-10-07

The owner clarified: “this game should be on bennys pc hub too. this is where ben tests games.” The desktop pass is now completed for this game. Its existing pickleballrally ID launches NARBE Pickleball Rally with a new thumbnail and an Electron-bridge entry point. The original game is preserved through Credits. No shared managers or other catalog entries changed. The web catalog remains unchanged. Desktop documentation and exact changed files are recorded in ELECTRON-SCAN-UPGRADE.md in Benny’s PC Hub. Four model tests and 23 integration checks pass using the actual Electron hub/preload/iframe/native-settings path and an isolated profile; the report has zero renderer errors. Physical-switch testing with Ben remains next. This supersedes the Electron-pending status in the web-preview entry below for this game only.


## NARBE Rally Club preview — 2026-10-07

User-authorized pickleball redesign; this is new gameplay work, not a scan-policy conversion. The original Pickleball Rally and both catalogs remain unchanged. The separate preview uses automatic movement, continuous sweeping aim or untimed placements, drive/dink/lob, independent pace and opponent settings, optional safe in-bounds shots, and no-fail target rallies. Credits retain SCSU and Lily Flack and identify NARBE's redesign. No online publication.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| bennyshub/apps/games/NARBEPICKLEBALL/index.html, style.css | WEB PREVIEW / ELECTRON CANDIDATE ONLY | New DOM interface and responsive court controls. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/model.js | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Deterministic rally simulation and opponent reach. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Procedural court, players and animation. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/game.js | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Shared choice adapter, independent aim mechanics, release input, pause, saves and credits. |
| bennyshub/apps/games/NARBEPICKLEBALL/js/three.min.js, THIRD-PARTY-LICENSES.txt | WEB PREVIEW / ELECTRON CANDIDATE ONLY | Existing local r155 dependency and retained MIT notice. |
| bennyshub/apps/games/NARBEPICKLEBALL/README.md | WEB PREVIEW / DOCUMENTATION | Controls, model limits and test coverage. |
| tests/rally-model.test.cjs, scripts/check-rally-club.cjs | WEB-ONLY / TESTS | 4 model tests and 45 browser checks pass. |
| artifacts/rally-club/ | WEB-ONLY / EVIDENCE | Test report and separately rendered screenshots. |
| SCAN-UPGRADE-CHANGES.md | WEB-ONLY / NOT NEEDED | This record. |

Reviewed 3D rendering at desktop, tablet and phone sizes; behavioral tests additionally cover 844×390 landscape. The same input contract passes with two switches and Auto Scan: recurring blank, reverse, parking, brake, owned speech, cancellation, pause, full match/replay and save recovery. Original game backed up and verified unchanged. Actual switch-user and Electron verification remain pending; do not treat this as a released game.

Separate approved website copy: SWITCHEDGAMES/index.html retains level submissions, changes the hero link to Create With Us, replaces full-game uploads with a collaboration proposal through the existing contact form, and explains NARBE accessibility/quality review with credited collaborators. Original file backed up before edit. No form submission, external message or deployment.


## Row Back stop — 2026-10-06

The owner reported that holding Space to scan backward through Messenger’s channels returned to the Channels/Exit menu instead of staying in the list, then asked for one consistent row behavior across apps and games. Every row the player enters now loops in both directions, including held-Space reverse and Auto, through its items plus a Back stop. The Back stop says “Back”, highlights no item and draws a dashed outline around the row; choosing it returns to the same row in row mode with its normal highlight. Scanning never leaves a row on its own, and rows no longer carry their own visible Back buttons. Row mode keeps its blank between the last row and the text row, which remains the only parking place. Hold-Enter Back still works where it did.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| Web and desktop `bennyshub/shared/choice-scan-adapter.js` | SHARED / DONE ON ELECTRON | `enterGroup(items, {wrap:true, backStop:true})` adds the looping Back stop and its dashed row outline (visible part only). Space there is consumed without pausing, as on the root blank. |
| Web and desktop `bennyshub/apps/tools/keyboard/app.js`, `index.html` | SHARED / DONE ON ELECTRON | The direct controller appends its own Back stop and uses the shared outline; the page loads the adapter. |
| Web and desktop `journal/app.js`, `streaming/app.js`, `phraseboard/board-choice.js` | SHARED / DONE ON ELECTRON | Keyboard, calendar and phrase rows (Row scan style and free-placement groups) use the Back stop; Phraseboard’s “Back to groups” button stays hidden. |
| Web and desktop `BENNYSBATTLEBOATS/scan-access.js`, `BENNYSMATCHYMATCH/scan-access.js`, `ELOUISESWORDSEARCH/game.js`, `NARBEANIMALFRIENDS/js/input.js`, `ui.js` | SHARED / DONE ON ELECTRON | Row-then-item grids and the name keyboard use the Back stop; Word Search’s Back item and Animal Friends’ “Back to rows” button are replaced by it. |
| `bennyshub/apps/tools/ytsearch/js/scanning.js` | WEB-ONLY / NOT NEEDED | Keyboard rows use the Back stop. |
| `tests/choice-scan-adapter.test.cjs`, `scripts/check-keyboard-row-wrap.cjs` | WEB-ONLY / TESTS | Loop order both ways, spoken Back, same-row return, root blank, Auto without parking, empty rows, app never receiving Back, and outline geometry; the browser row check counts the stop and returns through it. |
| `AGENTS.md`, `bennyshub/ACCESSIBILITY.md` | WEB-ONLY / BEHAVIOR REFERENCE | Document the row contract. |
| `bennyshub/service-worker.js` | WEB-ONLY / NOT NEEDED | Cache v35 prepares browsers for the changed scripts. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record scope and verification. |

Desktop-only surfaces received the same change: Messenger channels, messages and composer keyboard, Search, every RT Convo row (Convo, Phrases and Typing), and the Pet Pals name keyboard, whose per-row “Rows” key is replaced by the Back stop.

`choice-scan.js` is unchanged, so the Companion’s synced copy and its 1.0.8-keyboard-wrap package are untouched; `sync-companion-shared.cjs --check` and `package-companion.cjs --check` pass with the same SHA-256. Validation: `npm test` passes (214) and the desktop scan suite passes (72). The owner tested the desktop app and reports it working. The browser row check was updated for the stop but not run in this pass.

## Predictive keyboard row speech — 2026-10-05

The owner reported that predictive keyboard rows announced generic labels such as “Word predictions” instead of reading each displayed suggestion, and requested checking all predictive keyboards in both web and desktop apps. This is a scoped repair to the current desktop integration, separately authorized from the historical port plan below.

Prediction rows now resolve their current available suggestions when scanned and speak them in display order with pauses. This covers manual forward/reverse, Auto, and nested parent-row returns. Desktop Keyboard also reads predicted letters. Empty/disabled suggestions are omitted; empty rows announce “No predictions” (or “No letter predictions”). Journal retains word-pronunciation processing. Keyboard’s long-Enter shortcut uses one announcement instead of cancelling and repeating it. The controller owns the full speech completion ticket, preserving Wait for Speech.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| Web and desktop `bennyshub/apps/tools/keyboard/app.js` | SHARED / DONE ON ELECTRON | Live word/letter prediction labels; evaluate dynamic labels; remove duplicate long-Enter speech. |
| Web and desktop `bennyshub/apps/tools/journal/app.js` | SHARED / DONE ON ELECTRON | Read current words in order, preserving pronunciation. |
| Web and desktop `bennyshub/apps/tools/streaming/keyboard_integration.js` | SHARED / DONE ON ELECTRON | Read available search predictions. |
| `bennyshub/apps/tools/ytsearch/js/scanning.js` | WEB-ONLY / NOT NEEDED | Read current prediction words, omitting blank cells. |
| `scripts/check-prediction-row-speech.cjs` | WEB-ONLY / TESTS BOTH SOURCES | Speech regressions across four web and six desktop keyboards, covering 14 prediction rows. |
| `AGENTS.md`, `bennyshub/ACCESSIBILITY.md` | WEB-ONLY / BEHAVIOR REFERENCE | Document the prediction speech contract. |
| `bennyshub/service-worker.js` | WEB-ONLY / NOT NEEDED | Cache v34 prepares browsers for fixed scripts on the next publication. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record scope, verification and desktop application. |

Desktop Messenger’s word, phrase and common-word rows, Web Search’s prediction row, and RT Convo’s typing word/phrase rows already read their contents correctly; all passed without production edits.

Validation: reproduced the original web Keyboard failure (“predictive text” in place of six words). All **14 prediction rows** passed real Space/Enter renderer checks with captured platform speech: displayed order, refreshed suggestions, blank cells, nested return, held reverse, Auto entry, Wait for Speech completion plus a full interval, and TTS Off. Empty-row fallbacks were checked on repaired keyboards. **58 focused unit tests passed.** The existing row-wrap renderer suite also passed all **13 web/desktop keyboard surfaces**, covering reverse/forward wrapping, release behavior, Auto, brake, settings, Back and key selection. Native services/storage were isolated; no messages or AI requests were sent. These checks validate renderer behavior and speech text, not the live Electron process or physical switch hardware.

Backups, staged desktop copies, failing/passing evidence and the checksum-guarded apply script are in `../Website Backups/Prediction-row-speech-20261005-1791201436145`. All three applied desktop files match their tested staged checksums. The owner authorized publication. The website publishes through the existing GitHub Pages workflow on a push to main. Pre-publication validation passed all 206 unit tests, the reviewed build, the release audit (1,182 files, no findings), 920 page references, and the unchanged Companion ZIP checksum. Cache v34 delivers the updated app scripts.


The web upgrade covers all 26 catalogue games, six tools, legacy Mini Golf, Hub menus/Settings and Companion. The owner reports the local changes working well. On October 4, 2026, the owner reported 1.0.7 submitted and awaiting approval, with 1.0.5 still public. Store status has not been independently checked in the publisher dashboard.

This public map replaces the chronological working ledger; its complete original, task notes, backups and test attempts remain preserved locally. Current policy is maintained in [ACCESSIBILITY.md](../../bennyshub/ACCESSIBILITY.md) and [the developer guide](../../developer-guide.html). See [validation](../../submission/VALIDATION.md) and [the test checklist](../testing/SWITCH-ACCESS-TESTING.md).

## Companion app storage and caregiver restore — 2026-10-04

Companion now keeps Journal entries and unfinished drafts, Keyboard vocabulary/preferences, Streaming library/progress/settings and Day Hub weather preferences in local extension storage. With the new capabilities connected, these copies survive clearing the Hub website's storage. No cloud account or new permission is required. Removing Companion or its browser profile can remove these copies, so caregiver exports remain available.

The manifest stays at 1.0.8. The new immutable `journal-storage` revision includes this work and the earlier video-frame correction; the original 1.0.8 and 1.0.7 archives remain unchanged. Detection uses `journal-storage-v1` and `app-storage-v1`, since the original 1.0.8 package lacks these capabilities. Older Companion versions retain browser storage. This pass is WEB-ONLY; no Electron files were changed.

Migration preserves existing data, records origin-specific receipts and waits for successful durable writes before acknowledging saves. Concurrent edits use revision checks; differing legacy data and Journal drafts retain recovery copies. Clearing website storage does not clear Companion data. Journal resumes unfinished entries through Continue Entry, and waits for initialization before enabling Entries and Options.

Companion & data → My data keeps the existing Journal export/restore location and adds matching restores for Keyboard, Streaming and Day Hub. Validated imports target only that app's keys and use the same storage clients as its actual reader. A quiet Journal backup reminder stays in the caregiver area; the recorded export time means an export was requested, not that a download was independently verified on disk. Normal switch use saves automatically.

| Files | Scope / Electron port | Change |
| --- | --- | --- |
| `extension/journal-store.mjs`, `extension/app-data-store.mjs` | COMPANION / WEB-ONLY | Serialized local stores, migration receipts, validation, recovery copies and revision protection. |
| `extension/background.mjs`, `extension/hub-content.js` | COMPANION / WEB-ONLY | Restrict storage commands to authorized Hub pages; expose capabilities and persist validated playback progress. |
| `bennyshub/shared/journal-storage.js`, `bennyshub/shared/app-storage.js` | WEB-ONLY / WEB-ONLY | Shared Companion clients, browser fallback, pending-write recovery and startup hydration. |
| `bennyshub/shared/data-backup.js`, `extension/shared/data-backup.js` | WEB / COMPANION / WEB-ONLY | Exact shared backup validator for the actual app storage formats. |
| `bennyshub/shared/extension-client.js` | WEB-ONLY / WEB-ONLY | Preserve structured storage conflict errors. |
| `bennyshub/shared/tool-gate.js` | WEB-ONLY / WEB-ONLY | Allow the native caregiver editor gate to work when no scan manager is loaded. |
| `bennyshub/apps/tools/journal/app.js`, `index.html`, `journal-look.css` | WEB-ONLY / WEB-ONLY | Automatic durable entry/draft saves, Continue Entry, inline errors and safe startup navigation; retain Journal scan behavior. |
| `bennyshub/apps/tools/keyboard/app.js`, `index.html`, `predictions.js` | WEB-ONLY / WEB-ONLY | Restore before reading preferences/vocabulary and persist explicit app writes. |
| `bennyshub/apps/tools/dayhub/app.js`, `index.html` | WEB-ONLY / WEB-ONLY | Restore and save weather preferences through the shared client. |
| `bennyshub/apps/tools/streaming/app.js`, `index.html`, `editor.html`, `editor.js`, `web-streaming.js` | WEB-ONLY / WEB-ONLY | Restore library/settings/progress, protect against stale editor saves and await playback persistence. |
| `bennyshub/index.html`, `bennyshub/data-settings.html`, `bennyshub/data-settings.js` | WEB-ONLY / WEB-ONLY | Existing caregiver export/restore area, per-app restore/clear validation and quiet Journal backup reminder. |
| `bennyshub/service-worker.js` | WEB-ONLY / WEB-ONLY | Cache v32 with the new shared storage helpers. |
| `.gitattributes`, `scripts/sync-companion-shared.cjs`, `scripts/package-companion.cjs` | RELEASE / WEB-ONLY | Canonical helper parity and reproducible immutable revision packaging. |
| `scripts/check-companion-app-storage.cjs`, `scripts/check-scan-tools-journal.cjs`, `tests/app-data-store.test.cjs`, `tests/companion-data-client.test.cjs`, `tests/data-backup.test.cjs`, `tests/journal-security.test.cjs`, `tests/journal-store.test.cjs`, `tests/streaming.test.cjs` | TEST / WEB-ONLY | Real app migration/recovery/export/restore, storage failure/concurrency/security and legacy compatibility checks; drain real Companion replies between simulated scan-clock slices. |
| `bennyshub/extension-setup.html`, `bennyshub/companion-privacy.html`, `extension/README.md`, `submission/PERMISSIONS-AND-PRIVACY.md`, `submission/REVIEWER-INSTRUCTIONS.md`, `submission/START-HERE.md`, `submission/STORE-LISTING.md`, `submission/VALIDATION.md`, `submission/COMPANION-SHA256SUMS.txt` | RELEASE / WEB-ONLY | New download, precise local-storage/privacy limits, reviewer instructions and package checksum. |
| `SCAN-UPGRADE-CHANGES.md` | DOCUMENTATION / WEB-ONLY | Record changed files, behavior, validation and desktop scope. |

Validation: 203 unit checks and five Journal scan groups passed. Real unpacked-Companion checks exercise all four legacy migrations and app readers, entry/draft saving, recovery after website storage clearing, downloaded exports/restores and browser restart. Final acceptance and release results are recorded in `submission/VALIDATION.md`. The full tracked pre-change backup and test evidence remain locally under `artifacts/journal-companion-storage`; the backup is `before-75a5d99.zip`.

## Companion 1.0.8 video-frame correction

A centered provider video could retain its CSS translation after the Companion forced its box to the reserved frame. The translated image was then clipped to its lower-right quarter at the upper left. The fitted video, intermediate surfaces and frame now clear their own transform properties while caption positioning and the native DOM hierarchy remain intact. Unlock restores the original provider styling.

- `extension/player-view.js` — COMPANION / WEB-ONLY: normalize transforms only on fitted boxes; no Electron port.
- `scripts/check-player-layout.cjs` — COMPANION TEST / WEB-ONLY: the Netflix fixture now includes a centered video to catch the clipping regression.
- `SCAN-UPGRADE-CHANGES.md` — documentation / WEB-ONLY: record this correction and its validation.

Validation: the loaded-extension layout fixtures passed for Netflix, Disney, YouTube, Plex and direct-video fullscreen, including Help resizing, captions, scan selection and Unlock restoration. Eleven player-adapter/return unit checks passed. Independent transform reproduction and screenshots are retained under `artifacts/netflix-frame-fix`. These are controlled provider fixtures; signed-in Netflix playback still needs user confirmation. The submitted 1.0.7 ZIP and archived release are unchanged; the 1.0.8 package is prepared for review and is not a store-published update.

Release preparation on October 4, 2026 uses an immutable 1.0.8 ZIP with the frame correction. Additional file ledger:

| Files | Scope / port | Release change |
| --- | --- | --- |
| `extension/manifest.json` | COMPANION / WEB-ONLY | Advance to 1.0.8; no permission changes. |
| `bennyshub/extension-setup.html`, `bennyshub/service-worker.js` | WEB-ONLY | Link the 1.0.8 testing download; refresh cached setup under v30. |
| `extension/README.md`, `WEB-EXTENSION-MIGRATION.md` | Documentation / WEB-ONLY | Describe the frame correction, new candidate and current Scan Speed behavior. |
| `submission/START-HERE.md`, `submission/STORE-LISTING.md`, `submission/REVIEWER-INSTRUCTIONS.md`, `submission/VALIDATION.md`, `submission/COMPANION-SHA256SUMS.txt` | Release records / WEB-ONLY | Current package, reviewer notes, validation and exact checksum; preserve the historical 1.0.7 submission record. |

## Companion setup tutorial — 2026-10-04

Companion & data now includes a collapsed Watch tutorial disclosure with a video icon. Opening it loads the owner's YouTube setup video in a responsive, titled player; closing either disclosure or opening another Hub screen removes the player and stops playback. It uses the existing native caregiver-menu keyboard handling and normal page scrolling. This is website-only; Companion 1.0.8 and the Electron app are unchanged.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/index.html` | WEB-ONLY | Add the accessible tutorial disclosure, responsive embed and playback cleanup. |
| `bennyshub/service-worker.js` | WEB-ONLY | Refresh the cached Hub shell under v31. |
| `SCAN-UPGRADE-CHANGES.md` | Documentation / WEB-ONLY | Record this addition and its scope. |

Validation: desktop and mobile browser checks cover collapsed startup, Enter/Space disclosure controls, exact video URL, no horizontal overflow and cleanup on parent collapse or Hub/app navigation. The public YouTube embed loaded successfully in isolated Edge. All 145 unit tests, the public build, release audit and 905-link check passed. Local backup and browser evidence are retained under `artifacts/companion-tutorial`.

## Current behavior

- Stationary CHOICE menus use the shared scanner. Moving/timed MECHANIC surfaces retain native timing, input ownership and gameplay.
- Roots start blank and include recurring -1 in both directions. Step blank is silent/inert. Auto with Parking Off passes blank silently; only chosen/automatic parking permits Park/Parked narration. Parked Enter resumes the first item without activating it.
- Auto supports chosen parking or 1–3 completed loops, Space brake and owned speech completion plus a full interval. Existing guards, release selection, holds and multiplayer switch ownership remain.
- Scan pause uses only a dotted outline, without visible Paused text or badge. Game/video Pause menus remain. Parked clears highlights and reveals its existing status host.
- Parking/Loops/Brake/Wait settings live only in Hub Settings. Auto-only options remain visible but disabled when unavailable; Loops also needs Auto park. Values/selection persist. Existing local Auto/speed/voice options stay.
- Settings uses normal page scrolling. Input Sensitivity follows Auto; Size follows Background Theme. Selected items stay above the measured footer. Native disclosure/form input has one owner.
- Nested Back restores the parent row/item. Child entry starts at its first item; completing the child loop returns to root blank. Fresh roots and explicit separate modal returns may reset. No minimum press or extra debounce was added.
- Physics, difficulty, art and native holds remain. Racer's approved pre-race pause-access notice is included. Tap-friendly gameplay alternatives and hold-game warnings remain future work.

## Scope and port flags

SHARED identifies relevant behavior for both products; COMPANION identifies the browser extension; WEB-ONLY identifies website-only work. COPY-AS-IS means copy a verified helper unchanged after authorization. RE-PORT means compare/adapt the integration against the real desktop app. ADAPTER means implement the platform contract. WEB-ONLY means no desktop copy. No flag claims completed Electron work.

## Shared and platform file map

All helper filenames below are relative to `bennyshub/shared/` unless a full path is shown.

| Files | Scope | Responsibility | Port |
| --- | --- | --- | --- |
| `platform.js` | SHARED | Browser settings, speech tickets, matched input capture and activity lifecycle. | ADAPTER |
| `scan-manager.js` | SHARED | Central validated preferences and existing sensitivity guard. | COPY-AS-IS |
| `choice-scan.js` | SHARED | Blank loops, parking/brake, owned speech waits, held inputs and nested contexts. | COPY-AS-IS |
| `choice-scan-adapter.js` | SHARED | Explicit app IDs/contexts, redraw/group/Back/pointer mapping; no polling or extra global listeners. | COPY-AS-IS |
| `voice-manager.js` | SHARED | Started/finished/cancel tickets and bounded speech completion. | COPY-AS-IS |
| `scan-status-badge.js`, `scan-status-badge.css` | SHARED | Dotted selected-choice feedback and reserved Parked status. | COPY-AS-IS |
| `scan-settings.js` | SHARED | Portable centralized controls retaining option identity. | COPY-AS-IS |
| `bennyshub/index.html` | SHARED | Hub/Settings ownership, normal page/footer visibility and disclosure boundaries. | RE-PORT |
| `tool-gate.js` | WEB-ONLY | Companion-unavailable dialog suspends tool input and owns its choices. | WEB-ONLY |
| `bennyshub/service-worker.js` | WEB-ONLY | Offline shell with scan assets, tutorial and Companion storage helpers under v32. | WEB-ONLY |
| `bennyshub/setup.js`, `bennyshub/extension-setup.html`, `bennyshub/companion-privacy.html` | WEB-ONLY | Setup/return flow, package link and storage/access disclosures. | WEB-ONLY |

## Companion file map

Files below are relative to `extension/`; every row has scope COMPANION and port WEB-ONLY.

| Files | Responsibility |
| --- | --- |
| `player-platform.js` | Validated Hub-settings facade and extension platform adapter. |
| `player-content.js` | Shared scanning, existing guard, compact control row, Help and independent toolbar speech. |
| `player-view.js`, `player-adapters.js` | Reserved video/caption frame, constrained provider layouts, fullscreen recovery and cleanup. |
| `background.mjs` | Validated managed-player transport, live settings and serialized speech preference persistence. |
| `player-registration.mjs`, `policy.mjs` | Granted-host registration, dependency order, validated preferences and production origins. |
| `options.html`, `options.css`, `options.mjs` | Single Streaming and news switch, ten static platform names and separate Calendar. |
| `manifest.json` | Version 1.0.8 without added permissions. |
| `shared/choice-scan.js`, `shared/voice-manager.js`, `shared/scan-status-badge.js`, `shared/scan-status-badge.css` | Exact copies of canonical helpers. |
| `shared/scan-status-badge-style.js` | Generated CSS text for the player shadow root. |

The normal accepted dock is 60 px high. The ordered buttons scroll at narrow widths and reveal the selected choice; video/captions fit above them. Mute/Unmute controls media audio. Help's Toolbar Speech defaults On, persists locally and synchronizes across managed windows without altering Hub voice or media volume. Explicit Say I need help still speaks when automatic narration is Off. Unlock/Relock, Return to Hub and provider sign-in remain available.

Streaming and news grants/revokes the existing origin set together. Full access says On. Partial access says Incomplete and can be removed immediately; Off then On requests the complete set. Refused/incomplete operations cannot claim full success. Calendar, libraries and unrelated preferences are preserved.

## App map

Folders below are beneath `bennyshub/apps/`; each named file is relative to its app and shares the row's scope/port flag. HTML loads explicit dependencies; JS maps native contexts/input; CSS provides local dotted/status feedback. Compare desktop versions before replaying edits; do not replace whole app folders.

| App folder | Changed files | Stationary surfaces / navigation | Native mechanics and exclusions | Scope / port |
| --- | --- | --- | --- | --- |
| `games/BENNYSAYS` | `index.html`, `scan-access.js` | Main; Settings; Difficulty; Player color choices | Sequence demonstration, tones and timed failure/restart are native. No Enter hold-to-pause gesture exists. | SHARED / RE-PORT |
| `games/BENNYSBALLISTA` | `README.md`, `index.html`, `js/castle-files.js`, `js/ui.js`, `style.css` | Welcome, Settings, help, workshop/reset/custom/campaign/kingdom, post-story, pause, Zoom, stable outcomes and castle import; native importer Tab/typing retained. | Aim, power, fire, world physics/animation, Explore controls and native five-/seven-second pause holds remain. Stable results can wait indefinitely; no world freeze added. | SHARED / RE-PORT |
| `games/BENNYSBASEBALL2` | `index.html`, `js/choice-canvas.js`, `js/scenes.js` | Title/mode, Settings, instructions, season/team color; Pitch type/zone, stationary tactical batting and base targets; Existing frozen-pitch Pick a Swing, pause and results | Timed/held batting, pitch and ball flight, running and fielding remain native. Frozen-pitch swing and base-target acceptance use explicit existing-method UI fixtures. | SHARED / RE-PORT |
| `games/BENNYSBASKETBALLSHOOTER` | `index.html`, `scan-access.js` | Main; Settings; Pause; Pause Settings; Game-over choices | Continuous aimer, held power, release shot, physics and ten-second Enter pause remain native; only stationary menus are choice scopes. | SHARED / RE-PORT |
| `games/BENNYSBATTLEBOATS` | `index.html`, `scan-access.js`, `scripts/battleship.js` | Main; Settings; Fleet setup actions; Placed ships; Ship action modal; Placement rows; Placement cells/root boundary/parent restoration; Attack rows; Attack cells and native opponent turn; Pause while parked; Pause Settings; Private player handoff; Native five-second outcome display, no selectable controls | Enemy defense/shot timing is native and suspends choices. Five-second game-over display has no selectable controls and retains automatic return. Ship rules and fleet placement validation unchanged. | SHARED / RE-PORT |
| `games/BENNYSBOWLING` | `index.html`, `js/bowlchallenge.js` | Main, player setup/options, Settings and pause; Stationary Ball/Pause choice | Position/aim oscillation, held power, rolling physics and scoring remain native; native7.5s automatic game-over transition excluded. | SHARED / RE-PORT |
| `games/BENNYSBUGBLASTER` | `game.js`, `index.html`, `scan-access.js` | Main; Settings; Instructions Back; Store before purchases; Quit confirmation; Store available upgrades; Pause; Pause Settings | Moving enemies, active target selection, automatic stomp cadence, level intro and timed outcomes remain native. Five-second Enter pause preserved. | SHARED / RE-PORT |
| `games/BENNYSCHESSCHECKERS` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Legal board choices; Checkers legal destinations and cancel; Chess legal pieces; Chess legal destinations and cancel; Pause; Pause Settings | Legal move engine, CPU turns, timed game-over display and pause hold remain native; stationary human piece/destination decisions use shared policy. | SHARED / RE-PORT |
| `games/BENNYSCONNECTFOUR` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Legal board choices; Pause; Pause Settings | Drop animation, CPU turn and timed game-over presentation stay native; only available columns are choices. | SHARED / RE-PORT |
| `games/BENNYSDICE` | `index.html`, `js/game.js` | Main; Settings; Free Throw rules; Free Throw dice and throw controls; Pause; Pause Settings; Yarkle player setup; Yarkle rules; Yarkle turn decisions; Fahtzee player setup; Fahtzee rules; Fahtzee turn decisions | Three/Cannon physics, initiative, roll animation and CPU decisions stay native. Fahtzee automatic scoring retained; old manual scorecard state is not a reachable new user decision. | SHARED / RE-PORT |
| `games/BENNYSFISHMYSTERY` | `index.html`, `js/ui.js`, `js/util.js` | Main, Settings, dock, pause, world/map, logs and tackle; nested returns and owned entry speech. | Held steering, aim, cast/reel and fight remain native. Auto Space selection remains with Brake Off; Brake On uses shared braking. No new fishing mechanic. | SHARED / RE-PORT |
| `games/BENNYSFOOTBALL` | `index.html`, `js/choice-canvas.js`, `js/game.js`, `js/scenes.js` | Title/Settings, instructions/season/team color; Stationary offense/defense and other ScanList tactical decisions; Pause, nested Pause Settings and results | Live receiver scanner, moving routes/coverage, charge, kick aim/power, clock and play resolution remain native. Pause exclusively suspends underlying tactical choice input without altering world timing. | SHARED / RE-PORT |
| `games/BENNYSMATCHYMATCH` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Cache confirmation; Editor warning; Load game warning; Two-player mode; Single-player mode; Game setup; Unmatched rows; Card child groups and native mismatch delay; Pause while parked; Pause Settings; Challenge setup | Reveal/countdown/mismatch and timed win/loss sequences remain native; busy card play suspends scanning, menus remain available. Authoring/file picker requires mouse as existing warning states. | SHARED / RE-PORT |
| `games/BENNYSMINIGOLF` | `index.html`, `js/input.js`, `js/menu.js` | Legacy direct-URL main/instructions/mode/player setup; Settings/course/custom warning, creator-entry warning; Pause | Native hold aiming, hold charge, released shot and6s Enter pause preserved; timed intro/outro/game-over/challenge fail and mouse course editor excluded. Existing gameplay portrait Rotate Device gate remains. | WEB-ONLY / WEB-ONLY |
| `games/BENNYSPEGGLE` | `index.html`, `js/ui.js` | Title/modes/campaigns/levels/custom library, how-to/legend; Settings, nested Aim/Display, pause; Editor/load warnings, messages and win/loss results; Pre-shot: blank, Pause/Options, Take Shot | Held/automatic aiming, shot/obstacle/peg physics and existing5s Enter pause remain native. Pre-shot order explicitly requested; no new power/shot mechanics. | SHARED / RE-PORT |
| `games/BENNYSRACETRACKS` | `index.html`, `js/ui.js` | Title/mode/vehicle/level/how-to/Settings; Actual pause and results | Live driving, held steering, race progress, animations and native pause gesture remain unchanged; scanner is limited to explicit overlays. | SHARED / RE-PORT |
| `games/BENNYSSHOWNSOUND` | `index.html`, `js/choice-canvas.js`, `js/scenes.js` | Title/Settings, category carousel; Idle wheel choices, pause/settings and editor warning | Wheel spin/stop, reveal and media playback remain native. Category preview persists while selected; blank clears preview without introducing mechanics. | SHARED / RE-PORT |
| `games/BENNYSSLOTMACHINE` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Spin and bet actions; Autoplay choices; Pause; Pause Settings; Out-of-credits choices | Reel animation, automatic spins and bonus timing remain native; stationary spin/bet/autoplay/Pause/out-of-credits choices converted. Existing Enter-hold behavior preserved; no new hold-to-pause gameplay mechanic. | SHARED / RE-PORT |
| `games/BENNYSTICTACTOE` | `index.html`, `scan-access.js`, `script.js` | Main; Settings; Legal board choices; Pause; Pause Settings; Game-over decisions | CPU turn and game rules remain native; human board decisions and Yes/No replay menu converted. | SHARED / RE-PORT |
| `games/BENNYSWORDJUMBLE` | `game.js`, `index.html` | Main; Settings; File selection warning; Cache confirmation; Editor warning; Challenge difficulty; Casual length; Letter pool and sentence; Pause; Pause Settings | Success/input-frozen interval and challenge mechanics remain native. External authoring and native file picker remain mouse/keyboard tools behind scanned warnings. | SHARED / RE-PORT |
| `games/ELOUISESWORDSEARCH` | `game.js`, `index.html` | Main; Settings; Clear saved lists confirmation; Editor warning; How to play; Puzzle setup; Puzzle rows and word-bank/Pause choices; Direction decision; Row/cell restoration and distinct word-readout rest; Native automatic length resolution; Pause; Pause Settings; Puzzle completion | Automatic length traversal/word resolution commits gameplay and remains native. Read Words narration and its own bank rest remain native and distinct from shared -1. Native pointer drag/two-tap selection and five-second Enter back-out preserved; explicit Pause stays in row choices. Editor/file picker excluded behind warnings. | SHARED / RE-PORT |
| `games/NARBEANIMALFRIENDS` | `css/style.css`, `index.html`, `js/audio.js`, `js/input.js`, `js/ui.js` | Map/zone, play-mode and stationary navigation; Barn/Pick/Find animal choices, help/Settings/pause; Name keyboard rows and child keys | Reveal/song/narration busy timing and Three renderer remain native; no Enter-hold pause invented. | SHARED / RE-PORT |
| `games/NARBEKART` | `index.html`, `js/ui.js` | Title, rules/player count, type/speed, cup/track and instructions; Player-owned racer and kart choices, both native switches; Settings, pause, results/standings/trophy | Live racing, native single-button/held steering, lane timing, items, race progress and two-player ownership are unchanged; approved tap-only pause-access notice added to existing pre-race text and speech. | SHARED / RE-PORT |
| `games/NARBEMINIGOLF` | `index.html`, `js/game.js`, `js/ui.js` | Title/mode/players/color/course/how-to; Settings, nested Aim/Rules, pause; Editor/load warnings and round results; Easy Pause Putter/Pause and existing Choose Power list | Held/automatic aimer, native power charge, shot/swing/ball/obstacle physics and pause thresholds remain native. Initial Medium power preview unchanged; selecting power still performs native putt. | SHARED / RE-PORT |
| `games/PICKLEBALLRALLY` | `index.html` | Main/difficulty, Settings and pause; Untimed Casual three-zone decision only while not busy | Timed Slow/Medium/Fast zone/countdown, native timed keys, rally/ball/result animation remain native. Existing5s Enter pause preserved. | SHARED / RE-PORT |
| `games/ROBOTFOOTBALL` | `css/stadium.css`, `index.html`, `js/ui.js` | Main/Settings/help, team/season/match setup; Coin toss, playbook, conversion/kickoff/return and between-burst direction choices; Pause and ready next-play/final lists | Receiver aim/routes, field-goal aim/charge, held steering, movement bursts, ball flight/countdown remain native; independent deep tests exercised those boundaries. | SHARED / RE-PORT |
| `games/TRIVIAMASTER` | `index.html`, `script.js` | Main; Settings; Clear saved games confirmation; Editor warning; Game selection; Load game warning; Categories page; Categories next page; Answer, Pause and question readout; Pause; Pause Settings; End decisions | Question/media playback rest remains a separate native interaction. Answer feedback/delay remains native, with native Pause availability. Editor/file picker excluded behind scanned warnings. | SHARED / RE-PORT |
| `tools/dayhub` | `app.js`, `index.html`, `style.css` | Six daily-action choices; Native setup form suspends scan and preserves typed Space; Companion gate suspends tool input | Native weather/calendar/news functions and setup typing unchanged. | SHARED / RE-PORT |
| `tools/journal` | `app.js`, `calendar-view.js`, `index.html`, `style.css` | Main, options, entries, date navigation, questions, entry view/delete confirmation; Calendar controls/week/footer row hierarchy and month transition; Keyboard and prediction row restore; save/view/delete cancel | Storage, entries, questions and 3 s hold gestures retained; no data migration. | SHARED / RE-PORT |
| `tools/keyboard` | `app.js`, `index.html`, `style.css` | Text, prediction, control and letter/number rows with child choices; Same-row restore, prediction identity, child-loop root blank; Settings redraw retains changed option | Text insertion, learned predictions and existing 2 s hold gestures retained. | SHARED / RE-PORT |
| `tools/phraseboard` | `board-choice.js`, `board-enhancements.css`, `board-live.js`, `index.html` | Main/board/category grid rows or cells, free named groups, sentence controls and predictions; Settings and structural Row/Cell rebuild restore exact changed option; Create/load warnings and embedded media controls; native editors excluded; Existing spoken-group and TTS-on-scan preferences retained independently | Native board editor and media playback unchanged. Auto Space selects when Brake Off; Brake On pauses. Native 3 s holds retained. | SHARED / RE-PORT |
| `tools/streaming` | `app.js`, `index.html`, `keyboard_integration.js`, `style.css` | Main, settings, editor warning, genres/pages, title actions, seasons and episodes/pages; Pause, pause-to-settings return and explicit header Back; Search keyboard/text/predictions; launch/gate suspension; quiet-refresh identity mapping | Library/editor/Companion playback preserved; native 3 s reverse and 5 s pause gestures retained. | SHARED / RE-PORT |
| `tools/ytsearch` | `index.html`, `js/app.js`, `js/scanning.js`, `js/startup.js`, `styles.css` | Keyboard/history/prediction rows and child choices; Settings and active YouTube feed controls; Startup script-failure recovery choice | Native search, history and typing retained; 2.5 s reverse threshold/2 s repeat and 3 s Back retained. Dormant image/video branches without page DOM are not claimed as active features. | WEB-ONLY / WEB-ONLY |

Native mouse/keyboard editors remain unchanged; scanned entry/load/warning dialogs are covered. The `NARBEKART/tools/ui_mock.html` development mock is WEB-ONLY and excluded from the public build. Mini Golf's existing Choose Power still performs its native putt; no separate power-and-Putt confirmation was added. Fish hold mechanics remain without a tap-to-fish replacement or extra hold-game warning.

## Build, tests and documentation

| Files | Scope / port | Purpose |
| --- | --- | --- |
| `scripts/sync-companion-shared.cjs` | WEB-ONLY | Copy/check four canonical assets and generated CSS text. |
| `scripts/package-companion.cjs`, `scripts/package-release.py` | WEB-ONLY | Production allowlist/sanitization; Node is the active immutable extension packager. |
| `scripts/build.cjs` | WEB-ONLY | Build public roots and include only the setup-linked production ZIP. |
| `scripts/check-*.cjs`, `scripts/browser-check.cjs`, `scripts/player-layout-checks.cjs`, `scripts/release-assets.cjs` | WEB-ONLY | Retained browser/input/layout/release checks; [prerequisites](../../scripts/README.md). |
| `tests/*.test.cjs`, `tests/fixtures/scan-upgrade.html` | WEB-ONLY | Controller/adapter/speech/badge/app-boundary/package regression fixtures. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Current behavior contract. |
| `developer-guide.html` | SHARED / RE-PORT | Integration and native-mechanic guidance. |
| `README.md`, `CHANGELOG.md`, `AGENTS.md`, `SCAN-UPGRADE-TESTING.md`, `WEB-EXTENSION-MIGRATION.md`, `extension/README.md`, `submission/*.md` | WEB-ONLY | Release, privacy, validation and maintenance handoff. |

## Release and validation

Companion 1.0.7 is **101,050 bytes / 26 members**, SHA-256 `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`. Only its manifest version differs from accepted 1.0.6-blanket-access. Independent ZIP/CRC/unpacked checks, production scoping, shared parity and website-download parity passed. All 24 prior archive copies were unchanged.

The runtime baseline passed 142 unit tests; grouped-access settings passed 16 Edge UI groups. Version promotion passed three targeted existing package/shared-sync tests. All catalogue apps have recorded stationary-choice acceptance; focused later suites cover dotted feedback, the inline toolbar, independent speech and silent Parking Off. These overlapping fixtures are not exhaustive playthroughs. [Validation](../../submission/VALIDATION.md) records coverage and manual limits.

Local-only evidence roots: `artifacts/scan-web-complete/`, `artifacts/scan-outline-only/`, `artifacts/quiet-loop-final/`, `artifacts/companion-master-access/`, `artifacts/companion-1.0.7/`. Evidence, profiles and old ZIPs stay outside public source/build. Full source/document snapshots remain in the owner's external Website Backups directory.

## Publication cleanup

The pre-publication snapshot preserves the full previous ledger and source. Raw task notes and the one-time historical archive audit remain local. Public instructions use maintained accessibility/developer guidance; local evidence is listed without broken public hyperlinks. Release-owner cleanup removes retired prediction experiments, retains active prediction behavior, preserves submitted package bytes with scoped Git attributes, pins build tooling and checks the tracked Companion checksum.

### Final pre-push verification

The staged source was exported with Linux-style line endings, without local runtime/build/release files. All **142 unit tests** pass; the public build/audit and all **905 references** pass. The build has **1,179 files / 354,390,252 bytes**. Its Companion ZIP exactly matches the submitted SHA-256 in `submission/COMPANION-SHA256SUMS.txt`. These byte counts describe the clean Git export; previous local worktree reports may differ in web text line endings.

The complete pre-publication source snapshot contains **1,550 files**, with hashes verified before removal. **16 retired files / 17,575,492 bytes** were archived and removed. Earlier release archives remain unchanged and excluded from Git. Local pre-push evidence is stored under `artifacts/prepublish-1.0.7/`; it is not published. GitHub deployment and live checks follow the push and are not implied by this pre-push record.

| File | Scope | Cleanup | Electron port |
| --- | --- | --- | --- |
| `.gitattributes` | WEB-ONLY | Preserve byte-exact Companion inputs and their canonical shared copies across Git checkouts. | WEB-ONLY |
| `.gitignore` | WEB-ONLY | Keep raw task instructions and the historical workstation-only preservation audit local. | WEB-ONLY |
| `.github/workflows/pages.yml` | WEB-ONLY | Pin Node 22.16.0 and require the submitted Companion checksum before publishing. | WEB-ONLY |
| `submission/COMPANION-SHA256SUMS.txt` | WEB-ONLY | Record the exact submitted 1.0.7 ZIP expected in the public build. | WEB-ONLY |
| `LICENSE` | WEB-ONLY | Retain the same license text with its original CRLF bytes for reproducible packaging. | WEB-ONLY |
| `AGENTS.md` | WEB-ONLY | Use maintained accessibility/developer guidance instead of the local raw prompt. | WEB-ONLY |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Replace historical working notes with the current implementation map and preserve the locked Electron plan. | WEB-ONLY |
| `submission/VALIDATION.md` | WEB-ONLY | Summarize verified coverage and identify local-only evidence and live-check limits. | WEB-ONLY |
| `submission/START-HERE.md` | WEB-ONLY | Use current release instructions and owner-reported store submission status. | WEB-ONLY |
| `submission/STORE-LISTING.md` | WEB-ONLY | Record owner-reported 1.0.7 submission and public 1.0.5 status. | WEB-ONLY |
| `submission/REVIEWER-INSTRUCTIONS.md` | WEB-ONLY | Record owner-reported store status without claiming dashboard verification. | WEB-ONLY |
| `scripts/README.md` | WEB-ONLY | Document portable checks and optional browser-test prerequisites. | WEB-ONLY |
| `scripts/check-scan-tools-phraseboard.cjs` | WEB-ONLY | Remove a trailing-whitespace-only line from the browser test; behavior is unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm-client.js` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm-worker.js` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/COPYING-LGPL-2.1.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/DOUBLE-CONVERSION-LICENSE.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/EMSCRIPTEN-LICENSE.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/KENLM-LICENSE.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/README.txt` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/candidates.json.gz` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/english.arpa.gz` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/kenlm.js` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/kenlm.wasm` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/model-info.json` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `bennyshub/apps/tools/keyboard/kenlm/rebuild-source.tar.gz` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `scripts/build-kenlm.py` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `scripts/kenlm-browser.cc` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |
| `scripts/package-keyboard-model.py` | WEB-ONLY | Archive and remove the unused keyboard KenLM experiment or its build helper; local predictions remain unchanged. | WEB-ONLY |


## Scan Speed correction — 2026-10-04

Scan Speed stays enabled in both Step and Auto modes, since it also sets the interval for held backward scanning. Auto Scan, Input Sensitivity and Scan Speed share the first row; only Parking, Loops, Brake and Wait depend on Auto. Existing values and stable selection are retained. The correction passes 142 unit tests, 18 Settings browser groups, responsive/footer checks at three sizes, public build/audit and 905 links. Companion 1.0.7 bytes are unchanged.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/shared/scan-settings.js` | SHARED / COPY-AS-IS | Move Scan Speed beside Auto and sensitivity; keep it enabled in both modes. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Document the always-enabled speed control and shared row. |
| `scripts/check-hub-scan-settings.cjs`, `scripts/check-hub-scan-visibility.cjs` | WEB-ONLY | Check same-row layout, enabled speed, preserved choice and actual backward-scan interval. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record this correction for the Electron port. |

## Scan Speed range — 2026-10-04

The website offers exactly **1, 2, 3, 4 or 5 seconds**, with **2 seconds** still the default. The fifth value persists and wraps back to one second. Scan Speed remains enabled with Auto Off for held backward scanning. Phraseboard’s local Speed choice now reads the shared range rather than a separate four-value list. The Electron follow-up uses the same range.

Companion **1.0.7 needs no update** for this change: the Hub already transmits milliseconds, and the submitted extension accepts `scanInterval: 5000` through launch, live sync and polling. Its existing player honors that full interval. The extension’s transport safety clamp remains 1–10 seconds for compatibility; the Hub’s selectable range is 1–5. No extension source, version or ZIP was changed; submitted SHA-256 remains `51cc9dfb80e6eb2eb47341fd9abb11861ea17e98f857dcabd26e6f49007172f0`.

Validation: **55 focused unit tests** and **4 real Edge groups** passed, covering range/default/persistence, full five-second timing and brake resume, Companion transport/player timing, Hub Step reverse timing and Phraseboard cycling/identity. The six relevant packaged transport/player sources match their current production-sanitized sources. Local evidence: `artifacts/scan-speed-five/`; pre-edit copies are retained in Website Backups.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/shared/scan-manager.js` | SHARED / RE-PORT | Add the fifth speed without changing the default or prior indexes; desktop also migrates legacy six-second saves. |
| `bennyshub/apps/tools/phraseboard/index.html` | ADAPTER / RE-PORT | Derive local cycling and synchronization from the manager’s range; retain five-second fallback. |
| `bennyshub/ACCESSIBILITY.md` | SHARED / COPY-AS-IS | Update the selectable speed contract and default. |
| `developer-guide.html` | SHARED / RE-PORT | Update the selectable speed guidance and default. |
| `tests/scan-upgrade.test.cjs`, `tests/companion-scan-sync.test.cjs`, `tests/companion-player-scan.test.cjs` | WEB-ONLY | Cover the fifth speed, boundaries, persistence, timer and existing extension compatibility. |
| `scripts/check-scan-speed-five.cjs`, `scripts/check-companion-scan.cjs` | WEB-ONLY | Focused Hub/Phraseboard browser acceptance and five-value test mapping. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record this range correction and unchanged submitted Companion. |

## Ballista Settings navigation and cache refresh — 2026-10-04

Ballista’s Back choice was last in a fixed-height Settings grid and could be clipped completely in a short window. Back is now the first choice. The existing Settings list scrolls vertically when needed; no second scroll container is added. Fresh Settings entry starts at the top, while a value change preserves the selected item and reveals it. Back returns to the main menu or the in-game pause menu according to where Settings was opened.

Matching web and Electron files passed **21 focused browser groups each**, including 1280×720, 390×844 and 480×360 layouts, all 15 choices, silent blank traversal, Auto, parking, dotted brake, redraw/resize identity and both exit routes. Evidence: `artifacts/ballista-settings-back/`. Browser fixtures use isolated storage and desktop source without launching native services.

Website cache advances to v29. Offline acceptance verifies the new scan-manager bytes and the five-second setting with Auto Off. Final website validation passed 145 unit tests, 905 links, the public build and release audit. Submitted Companion 1.0.7 remains unchanged.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/apps/games/BENNYSBALLISTA/js/ui.js` | ADAPTER / DONE ON ELECTRON | Put Back first; reset fresh Settings scroll without resetting in-place selection. |
| `bennyshub/apps/games/BENNYSBALLISTA/style.css` | ADAPTER / DONE ON ELECTRON | Make overflow reachable inside the existing Settings list and retain highlight space. |
| `scripts/check-ballista-settings-back.cjs` | WEB-ONLY | Reproduce both return routes and clipping at three window sizes; accepts a desktop source root. |
| `bennyshub/service-worker.js` | WEB-ONLY | Refresh cached app assets with v29. |
| `scripts/check-scan-offline.cjs` | WEB-ONLY | Verify cache v29, exact manager bytes and enabled five-second Step setting offline. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record this fix and its completed desktop application. |

## Accessibility documentation reconciliation — 2026-10-04

Verified the shipped sources before editing. Web ACCESSIBILITY.md §§4, 7–9, 11 and 12 now records all five scan speeds, all 26 catalog games (five previously missing), current cancellation handlers, optional batting/pause routes, actual Bowling oscillation periods and the distinct board scan models. Pause coverage distinguishes scan choices from pointer-only buttons and native holds; Racer is not the only remaining hold-dependent game. BENNYSMINIGOLF is identified as the separate legacy direct-URL build.

The user separately requested matching Electron documentation and Matchy Match edits in this session. The desktop root ACCESSIBILITY.md retains its native storage, bridge and Python notes, uses its actual 28-game catalog, adds Pet Pals and Sphere Splash notes, and records seven of eight tool cancellation handlers (Web Search has none). Desktop scan speeds were already correct. Desktop Matchy Match lacks the web full spoken consequence warning on open; the document now states that gap. Show n Sound's Continue-first warning remains outside the authorized app-code change.

In each build, the only application-code change swaps Cancel and Continue (Mouse Needed) in Matchy Match's editorWarning array. Existing actions, speech, defaults, timing, mechanics and scan behavior are preserved. Originals of both edited desktop files and all three web files are backed up under Website Backups/Accessibility-doc-sync-20261004-1791149761767.

Validation: npm test passed **203/203** web tests. Four headless Edge renderer checks (web/desktop source × Step/Auto) verified fresh blank focus, inert blank Enter, Cancel as the first scanned choice, return to Settings and no editor tab on Cancel. Electron has no npm test script; its native runtime was not launched. Exact comparison against backups verifies that each script differs only by the requested two-item order. Git diff --check passes.

| Files | Scope / port | Change |
| --- | --- | --- |
| `bennyshub/ACCESSIBILITY.md` | SHARED / ADAPTED ON ELECTRON | Reconcile documented controls, catalog coverage, cancellation history and pause routes. |
| `bennyshub/apps/games/BENNYSMATCHYMATCH/script.js` | ADAPTER / DONE ON ELECTRON | Put Cancel before Continue in the editor warning; preserve all other code. |
| Electron `ACCESSIBILITY.md` | DESKTOP / DONE ON ELECTRON | Apply equivalent corrections with the desktop catalog, extra games and actual tool/warning gaps. |
| Electron `bennyshub/apps/games/BENNYSMATCHYMATCH/script.js` | DESKTOP / DONE ON ELECTRON | Apply only the same two-item warning reorder to the existing desktop file. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY | Record authorized scope, backups and validation. |

## Keyboard row compatibility repair — 2026-10-04

The owner explicitly requested repairs in both the website and the Electron app. This scoped desktop repair is authorized separately from the historical locked port plan below. The previous accessibility documentation and Matchy Match warning-order changes remain intact.

Compared the pre-conversion Keyboard, Journal and Streaming code in `Bennys-Hub-tools-before-choice-conversion-20261003` with the desktop backup dated `2026-10-04T14-37-42-938Z` (including Messenger). Native keyboard keys used modulo wrapping in both directions. The shared child-boundary policy had replaced that with a return to root blank, so another held reverse tick selected the bottom row. Keyboard groups now opt into `enterGroup(children, {wrap:true})`; root blanks, non-keyboard groups, app-owned hold thresholds, defaults and gameplay remain under their existing rules. Keyboard-local cycles do not count as completed root parking loops. Selection and native Back routes still leave the row. RT Convo keeps its existing five-second return to the text row.

Touched-file backups and the guarded desktop staging manifest are in `../Website Backups/Keyboard-row-wrap-before-20261004-1791151042905`. Existing release archives were not changed. Desktop files are patched against their own originals, preserving desktop-specific integrations and data.

| File(s) | Scope / Electron status | Change |
| --- | --- | --- |
| `bennyshub/shared/choice-scan.js` | SHARED / DONE ON ELECTRON | Opt-in local wrapping on the group stack; no root parking count for keyboard-local cycles. |
| `extension/shared/choice-scan.js` | WEB-ONLY / NOT NEEDED | Keep the checked-in Companion helper byte-identical; no extension install or release. |
| `bennyshub/apps/tools/keyboard/app.js`, `bennyshub/apps/tools/journal/app.js`, `bennyshub/apps/tools/streaming/app.js`, `bennyshub/apps/games/NARBEANIMALFRIENDS/js/input.js` | SHARED / DONE ON ELECTRON | Opt keyboard rows into wrapping; calendar and other nested choices keep their existing behavior. |
| `bennyshub/apps/tools/ytsearch/js/scanning.js` | WEB-ONLY / NOT NEEDED | Wrap the YouTube Search keyboard row. |
| Desktop `bennyshub/apps/tools/messenger/keyboard.js`, `bennyshub/apps/tools/search/app.js`, `bennyshub/apps/tools/rt-convo/index.html`, `bennyshub/apps/games/NARBEPETPALS/js/scan-access.js` | DESKTOP / DONE ON ELECTRON | Wrap composer, search, typing-mode and spelling rows. RT Convo non-typing board groups are unchanged. |
| `bennyshub/ACCESSIBILITY.md`; desktop root `ACCESSIBILITY.md` | SHARED / ADAPTED ON ELECTRON | Section 4 documents keyboard-local wrapping and root parking. Desktop section 11 corrects handler coverage: direct inspection confirms Web Search also registers cancellation, so all eight tools do. |
| `AGENTS.md`, `developer-guide.html` | WEB-ONLY / NOT NEEDED | Document the keyboard exception so the generic child-boundary rule cannot reintroduce this regression. |
| `tests/choice-scan-adapter.test.cjs` | WEB-ONLY / NOT NEEDED | Regression tests for repeated forward/reverse wraps, single-item rows, redraw/removal, Back, default-group isolation, five speeds, Auto, brake, speech wait and root parking. |
| `scripts/check-keyboard-row-wrap.cjs` | WEB-ONLY / TESTS BOTH SOURCES | Actual renderer regression suite with real key events and synthetic native services; optional `--desktop-root` and `--desktop-overlay`. |
| `scripts/check-scan-tools-core.cjs`, `scripts/check-scan-tools-journal.cjs`, `scripts/check-scan-tools-streaming.cjs`, `scripts/check-scan-tools-ytsearch.cjs`, `scripts/check-scan-sports-animal-deep.cjs` | WEB-ONLY / NOT NEEDED | Correct earlier assertions that encoded keyboard child-to-root exits. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record cause, authorization, backup, scope and validation. |

Validation: the three new unit regressions failed against the original scanner and pass after repair. `npm test`: 206/206 passed. Renderer checks cover five web keyboards and eight desktop keyboards, each with three complete held-Space reverse cycles, forward wrap, release behavior, Auto, brake, settings changes, native Back and key selection. Keyboard and Messenger also run held reverse at the five-second scan speed with Auto Brake Off. Native messaging, credentials, microphone and backend writes are isolated; no message is sent. These are renderer checks of the actual app files, not a claim that the live Electron process or physical switch device was exercised. Results: `artifacts/keyboard-row-wrap/report.json`.

## Authorized site publication — keyboard compatibility repair

The owner requested publishing the completed fixes. GitHub Pages deploys the reviewed `dist` artifact on a push to `main`. Canonical scanner parity changes the Companion ZIP bytes, so the build uses a separate immutable `1.0.8-keyboard-wrap` candidate (manifest remains 1.0.8); the earlier journal-storage archive is preserved. No store submission is part of this website deployment.

| Files | Scope / Electron status | Publication change |
| --- | --- | --- |
| `bennyshub/extension-setup.html` | WEB-ONLY / NOT NEEDED | Link the new immutable testing ZIP. |
| `bennyshub/service-worker.js` | WEB-ONLY / NOT NEEDED | Increment the offline shell cache to v33. |
| `extension/README.md`, `submission/START-HERE.md`, `submission/VALIDATION.md`, `submission/COMPANION-SHA256SUMS.txt` | RELEASE / NOT NEEDED | Document the exact candidate, preserved archive, keyboard validation and CI checksum. |
| `SCAN-UPGRADE-CHANGES.md` | WEB-ONLY / NOT NEEDED | Record the authorized publishing scope and required release metadata. |

Publication metadata backups are in `../Website Backups/Keyboard-site-publish-20261004-1791151996892`. The package checksum is `4db777db1037e3ff9fd7469211ab385302cdebf25acb116cd73d433b0bbf3eab` (112,120 bytes, 29 members).

## ELECTRON PORT PLAN — LOCKED

No desktop files were changed. This plan may start only after the user tests/confirms the web changes and explicitly says **"start the Electron pass."**

Desktop root: the separate Electron source location supplied privately by the owner, outside this repository.

### COPY-AS-IS destinations after authorization

These policy/helper files go to the same relative destination beneath that desktop root, unchanged after verification:

| Web source | Electron destination relative to desktop root |
| --- | --- |
| `bennyshub/shared/scan-manager.js` | `bennyshub/shared/scan-manager.js` |
| `bennyshub/shared/voice-manager.js` | `bennyshub/shared/voice-manager.js` |
| `bennyshub/shared/choice-scan.js` | `bennyshub/shared/choice-scan.js` |
| `bennyshub/shared/choice-scan-adapter.js` | `bennyshub/shared/choice-scan-adapter.js` |
| `bennyshub/shared/scan-status-badge.js` | `bennyshub/shared/scan-status-badge.js` |
| `bennyshub/shared/scan-status-badge.css` | `bennyshub/shared/scan-status-badge.css` |
| `bennyshub/shared/scan-settings.js` | `bennyshub/shared/scan-settings.js` |
| `bennyshub/ACCESSIBILITY.md` | `bennyshub/ACCESSIBILITY.md` |

App integrations marked RE-PORT keep their same relative folders from the app mapping above. Compare desktop versions first; do not overwrite whole app folders, catalogs, data, Electron bridges or native launch behavior. New standalone choice bridges may be copied only after confirming their app APIs match. Web-only YouTube Search, Companion transport, setup/download pages, tool gate and service worker do not belong in that copy.

### Desktop platform adapter

Implement the same contract at `bennyshub/shared/platform.js`:

- **Settings:** `settings.open({key,normalize,project,onChange})` returns `readCached()`, `save(value)`, `reload()`. Desktop scan settings currently use localStorage; voice settings also use `electronAPI.voice` IPC and cache. Supply synchronous cached defaults, settle later native loads, preserve existing keys/unknown fields, and propagate live changes without echoes.
- **Speech:** voices and voice-change subscription; `speak(text,options)` returns `{started,finished,cancel}`; `cancel()` settles the owned request. Map actual native start/end/error/cancel events through existing voice IPC. Shared voice policy owns the cap. Missing engine events must never strand scanning or let a stale utterance advance another context.
- **Input:** `input.capture(handler)` supplies original matched Space/Enter/NumpadEnter press/release events before app handlers exactly once. Preserve player-owned multiplayer switches and native holds. Do not reintroduce desktop's old minimum-press filter or double-register browser plus native events.
- **Lifecycle:** `lifecycle.onActivity(callback)` with cleanup, mapping focus/visibility/native activation. Clear half-held inputs and restart a full interval on resumption.

### Python streaming control bar

Re-port behavior in `bennyshub/apps/tools/streaming/utils/control_bar.py`: recurring blank stop, silent Step deadzone, Auto chosen/loop parking, visible Parked status, Enter resume without activation, and Space brake tap/hold/full-interval resume. Read the Hub's saved scan mode, interval, sensitivity and new parking/brake fields through its existing settings transport. This Python scope is **park and brake only**; do not invent speech-wait support or replace media/navigation controls. Preserve its native hold thresholds. Messenger's separate Python bar and backend are not this control bar.

### Desktop acceptance before any sync claim

Back up the complete working desktop first. Test speech end/failure/timeout/cancellation, recorded-label completion, IPC/cache startup races, storage persistence, live settings, duplicate key capture, valid short releases, native long holds, focus loss, app/iframe ownership, multiplayer keys, all nested returns and visible status at the actual desktop window sizes. Re-run the per-app web checklists with the real desktop engines. Audit COPY-AS-IS hashes and mark every ledger entry DONE ON ELECTRON or NOT NEEDED only after verification.

Desktop-only Pet Pals, Sphere Splash, Web Search, Messenger and RT Convo remain unverified and require their own scope and checklists. Do not label them web-tested.


## 2026-10-07 — Pickleball first-person redesign requested by owner

Scope: owner explicitly requested the game in Benny’s PC Hub and then a first-person CPU match, Peggle/Bowling hold-Space reversing aim, optional auto aim, direct touch/mouse court play, and compact embedded controls. This supersedes the previous prototype controls within this game only. Desktop was already explicitly authorized; this is not an unsolicited Electron scan port.

Changed web preview files (Electron flag: already implemented in the owner-authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/index.html — direct court surface and compact HUD; web entry retains no Electron bridge.
- bennyshub/apps/games/NARBEPICKLEBALL/style.css — removes shot/aim panels; 64px court options, responsive compact score and hints.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — manual held/reversing aim, optional auto aim, immediate aiming, optional in-court Play/Pause scan, pointer capture, hold pause, cancellation and saved shot style.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — player-eye camera, facing CPU, animated hand/paddle, procedural court surface and palms; ball framing follows necessary movement.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — current controls, source scope and test evidence.
- SCAN-UPGRADE-CHANGES.md — this ledger.

Backups of the prior web preview and this ledger are in the desktop workspace under tmp/rally-first-person-backup. Original Pickleball, web catalog, shared managers, release ZIPs, dependencies and live website are unchanged. Desktop controls passed the actual Hub fixture; pointer/touch and responsive tests cover the common game code. Test evidence remains local under tmp/rally-electron and tmp/rally-first-person in the desktop workspace.



## 2026-10-07 — Pickleball direct shot scan and continuous bounce

Owner-requested game follow-up, implemented first in the explicitly authorized desktop Hub. Scope: Space/Enter must reach Drive, Dink and Lob directly on court, and returns must visibly bounce in slow motion to the paddle. The court scan now offers Drive, Dink, Lob and Pause before aiming. Held/reversing Space remains the aim control after selecting a shot. Ball flights now distinguish bounce and contact, slow on the player approach, and keep their position continuous at CPU return and ready state. Initial serves and between-point feeds are animated too.

Changed web files (Electron flag: already applied and tested in the authorized desktop build):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — continuous bounce/contact paths, slow approach, serve feed and old-save flight migration.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — direct shot scan, selection previews, settings/help and bounce cue.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — trajectory preview and ball spin synchronized to flight.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — current controls and validation.
- SCAN-UPGRADE-CHANGES.md — this ledger.

Backup: desktop tmp/rally-shot-bounce-backup, including the prior web game and ledger. Desktop validation passes 39 native Hub checks, 21 browser checks and 8 simulation tests. Actual rendered bounce/ready/shot-selection screenshots reviewed. Shared managers, original game, catalogs, releases and live deployment are unchanged.



## 2026-10-07 — Robot Pickleball, automatic paddle and accessible movement

Owner-requested game work, already explicitly authorized in Benny's desktop Hub. Final play uses automatic forehand/backhand returns and positioning-based contact, Space/Enter left/right controls, alternating one-switch control, optional tap-without-hold movement and automatic depth coverage. Full speed, slower approaches and stopped-ball no-fail play are available. Every rally offers Serve/Pause through the shared CHOICE scan. Scoring tracks service and uses standard singles side-outs and 11/win-by-two; serves are diagonal from the proper baseline side. Robots replace every humanoid, including the first-person hand. Lily's original and credit remain.

Changed web files (Electron flag: already implemented and tested in the owner-authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/index.html — compact Serve/Pause controls; no Electron bridge.
- bennyshub/apps/games/NARBEPICKLEBALL/style.css — short-screen hint placement and court controls.
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — service ownership, scoring guards, automatic contact quality, depth coverage and full-speed flight.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — one/two-switch and no-hold movement, automatic returns, no-fail waiting, neutral Continue and owned pause timers.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — robot athletes/crowd/gripper, forehand/backhand poses and reach animation.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — final controls, rules, scope and verification.
- SCAN-UPGRADE-CHANGES.md — this ledger.

Backups live in the desktop workspace under tmp/rally-move-charge-backup and tmp/rally-robot-backup. Fifteen model tests and 32 actual native Hub checks pass. The desktop browser run and this F-drive prototype each pass 45 checks, with no runtime errors; rendered mobile/desktop layouts reviewed. CSS and all three game JavaScript files match the desktop by SHA-256. Shared managers, original game, web catalog, release ZIPs and live deployment remain unchanged.


## 2026-10-07 — Club sign, Enter steering, target taps and automatic matches

Owner-requested desktop testing refinements, mirrored to this prototype. The NARBE RALLY CLUB sign has padded text fitting and is raised above the robot; movement tiers are about one-third faster with saved-setting migration. Tap input targets the incoming contact position and stops without overshoot; it remains timed and forgiving outside No-fail. Hub Auto Scan now enables Enter-only alternating held movement as Racer does. Opponent selection and the result menu are removed; completed matches automatically prepare the next opponent at Serve/Pause. No-fail and Just rally offer the same blank Serve/Pause break after six returns without changing service or scores.

Changed web files (Electron flag: already implemented in the explicitly authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — bounded target movement, faster default and current return prompts.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — input integration, speed migration, tap targeting, automatic opponent sequence and periodic no-fail break.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — fitted, raised NARBE RALLY CLUB sign.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — revised behavior and verification.
- SCAN-UPGRADE-CHANGES.md — this record.

Backup: desktop tmp/rally-tap-refinement-backup contains prior desktop/web game files, tests, thumbnail and ledgers. Seventeen model tests pass. Thirty-seven native Hub checks verify Enter-only controls, no-overshoot taps, input cancellation and saved settings in an isolated profile. The initial desktop browser run passes 57 checks; additional checks cover the subsequently requested periodic no-fail breaks and timed tap deadlines. Final browser verification is recorded below. The web catalog, original game and live deployment remain unchanged.

Final expanded verification: all 67 browser checks pass on the synchronized F-drive prototype with no runtime errors. This covers early and late full-speed taps, continued timed play beyond six returns, regular No-fail/Just rally Serve/Pause breaks, blank Enter safety, short-press Pause access and final-shot target-star retention. Report: desktop tmp/rally-tap-refinement-web-check/browser-report.json. The earlier desktop 57-check and native 37-check reports are retained in tmp/rally-tap-refinement. The short practice cue reads BREAK EVERY 6 for small-screen fit.


## 2026-10-07 — Armed direction, physical paddle contacts and score-free practice

Explicit owner-requested follow-up in the desktop Hub and matching web prototype. A compact, noninteractive arrow shows NEXT HOLD left/right in one-switch held play and HOLDING while moving; it is absent from choice menus, tap targeting and two-switch play. The home entry is now Settings. Short Enter gameplay presses never pause; the six-second pause timer verifies continuous ownership by the initiating held input. Selecting Serve cancels the old prompt and says You serve or Robot serves.

The CPU moves beside and behind the contact point. Articulated shoulder/elbow/gripper poses put its paddle face one ball radius from contact for forehand, backhand, low and overhead returns, with follow-through. Body collisions resolve as paddle misses instead of passing through the robot. First-person paddle height/side follow the ball; low-shot depth keeps contact visible. Once aligned after a one-switch or tap input, the remaining approach finishes continuously in about 0.22 seconds after the bounce (up to 0.5 seconds before it), retaining the bounce and timed-mode deadline. Bench robot thighs now rest above the seat, with knees/shins beyond the edge. No-fail and Just rally suppress points, wins, target stars and the scoreboard; only returns-until-break remains. The six-return Serve/Pause break remains available.

Changed game files: index.html, style.css, js/model.js, js/game.js, js/scene.js and README.md under bennyshub/apps/games/NARBEPICKLEBALL. Electron flag: already implemented in the explicitly authorized desktop game. The web entry omits the Electron bridge and keeps WEB PREVIEW. This change ledger is updated. Desktop-only updates also include ACCESSIBILITY.md, ELECTRON-SCAN-UPGRADE.md, all three tests/rally-* fixtures and the rendered bennyshub/images/games/narbe-pickleball-court.png thumbnail.

Backups: desktop tmp/rally-direction-cue-backup and tmp/rally-contact-backup. Validation so far: 21 model tests, 80 desktop browser checks and 41 native Hub checks. Native testing uses real input events in an isolated profile; short Enter presses move, and six-second holds pause. CPU paddle-face contact was measured at exactly the 0.135 ball radius for all four stroke poses; actual one-switch and tap post-bounce quick returns measured about 222 ms. Mobile/desktop direction cues, stroke poses and spectator seating were visually reviewed. Evidence: desktop tmp/rally-contact-review. Final prototype verification follows below.

Final verification: the synchronized F-drive prototype passes all 80 browser checks with no runtime errors. The final model passes all 21 tests. Desktop native input evidence remains 41 passing checks. CSS, model, controller, renderer and README match desktop by SHA-256; entry HTML differs only by the intentional Electron bridge and preview label. Reports: desktop tmp/rally-contact-web-check/browser-report.json and tmp/rally-contact-review. Original Pickleball, shared managers, catalog identities and release packages remain unchanged.


## 2026-10-07 — Incoming-ball one-switch direction and fixed robot arms

Owner-requested follow-up in Benny's PC Hub and the matching F-drive prototype. For each opponent return, a fresh one-switch Enter press chooses the direction toward its receiving/contact position, even while the ball is still on the opposite side of the court. It can choose the same direction on successive presses. The cue uses the same decision, shows READY when already aligned, and the direction remains fixed throughout a hold. Release stops movement; the six-second pause behavior is retained. Outside an incoming return, alternating repositioning remains. Help text and the desktop catalog description now reflect this change.

Both visible paddle arms use fixed upper-arm and forearm lengths through a two-joint solver. The CPU stands closer laterally and forward to the ball, crouches slightly for low returns, and keeps its feet grounded. Its paddle is scaled to match the normal arm reach. Physically unreachable shots resolve as misses rather than extending the arm. The first-person arm also retains fixed lengths, with a small lean/crouch for wide and low contacts. Forehand, backhand, low and overhead strokes still meet the ball.

Changed web files (Electron flag: already implemented and tested in the explicitly authorized desktop game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — incoming receiving-side input and cue, instructions.
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — closer footwork and physical paddle reach.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — fixed-length joints, contact poses and low-shot stance.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — current behavior and verification.
- SCAN-UPGRADE-CHANGES.md — this record.

Desktop-only changes: bennyshub/apps/games/games.json (description only), ACCESSIBILITY.md, ELECTRON-SCAN-UPGRADE.md and the three tests/rally-* fixtures. Backup: desktop tmp/rally-ball-direction-backup, including the prior F-drive files and ledger.

Validation: all 22 model tests, 84 desktop browser checks, 84 synchronized F-drive browser checks and 41 native Hub checks pass with no runtime errors. The new browser cases cover the receiving-side direction while the ball is on the opposite side, a fresh press toward that position, and READY feedback. Rendered measurements across both sides and three heights confirm CPU segment lengths 0.46/0.44 and first-person lengths 0.44/0.42, with paddle-face contact one ball radius (0.135) away. Evidence: desktop tmp/rally-ball-direction-review and tmp/rally-ball-direction-web-check. The four synchronized game files match by SHA-256. Lily's original still matches its pre-redesign backup; shared managers, other games, web catalog, release packages and the production profile were not changed. No live deployment.


## 2026-10-07 — Correct paddle orientation and head/torso clearance

Owner-requested correction in the desktop game and F-drive prototype. The first-person arm base is lower and behind the paddle, with separate low/normal/overhead heights; its elbow bends toward the player instead of leaving an upper-arm segment ahead of the resting paddle. The opponent holds its ready paddle slightly angled in front, with its elbow behind the grip. A supported forward shoulder mount, height-dependent elbow bend and forward limits on recovery keep the arm out of the head and torso. CPU receiving depth and physical-reach calculations use the same mount. Fixed limb lengths and actual ball/paddle contacts are retained.

Changed web files (Electron flag: already implemented in the explicitly authorized Benny's PC Hub game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — shared shoulder position and corresponding receiving depth/reach.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — player arm orientation, front ready grip, shoulder mount and full swing clearance.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — corrected poses and verification.
- SCAN-UPGRADE-CHANGES.md — this record.

Desktop-only changes: tests/rally-arm-poses.cjs (new repeatable rendering regression), ELECTRON-SCAN-UPGRADE.md. Backup: desktop tmp/rally-arm-facing-backup, including previous desktop/web sources and both ledgers. Controls and camera framing are unchanged.

Validation: all 22 model tests and 84 desktop browser checks pass. The new rendering fixture passes on both desktop and synchronized F-drive source: 27 complete shot/position combinations spanning 5,940 frames, conservative capsule-versus-head/torso clearance, constant limb lengths, 16 first-person contact poses with the shoulder behind the paddle, and six CPU contacts one ball radius from the face. Close-up ready/overhead and first-person low/normal/overhead images were reviewed. Evidence: desktop tmp/rally-arm-facing-review and tmp/rally-arm-facing-web-check. The three copied game files match by SHA-256. No shared managers, original game, release packages or personal profile changed; no live deployment.

## 2026-10-07 — Rebuild both robots' paddle arms; footwork without warping; serve aim

Owner-requested fix in the desktop game (Benny's PC Hub, where Ben tests) and the F-drive prototype. The previous attempt was replaced, not tuned: its player arm could stretch, switch sides or float, and the opponent's elbow bent inside out through its head and body. Both robots now share one paddle arm on a shoulder socket fixed to the torso, with fixed-length upper arm and forearm and an elbow solve with joint limits that swivels away from the head and torso. Each stroke (forehand, backhand, low, overhead and the underhand serve) runs take-back, contact, follow-through and recovery; take-back and finish turn the contact arm at the shoulder so elbow and wrist stay natural, and every stroke swings through the ball. Reach comes from footwork: an eased step capped at a stepping pace, a crouch and torso turn. Displayed robots never move faster than a sprint, robots walk to their serve spots between points instead of appearing there, and mouse/touch dragging runs the robot to the spot. First person looks out through the player robot's visor and briefly follows the ball onto the paddle. Serve aim: two-switch Space holds move the target (release stops, each hold reverses), One switch and Tap sweep it by itself, Enter stops it on the press and the release serves; the target stays in the legal diagonal box, shown by a glowing box, target ring, flight arc and a pin of light with a direction chevron; a six-second Enter hold pauses instead; robot serves need no aim.

Changed web files (Electron flag: already implemented in the explicitly authorized Benny's PC Hub game):
- bennyshub/apps/games/NARBEPICKLEBALL/js/model.js — stroke zones and footwork reach, player stance depth, serve aim limits, walk to serve spots.
- bennyshub/apps/games/NARBEPICKLEBALL/js/scene.js — shared arm rig, joint-space strokes and clearance, eased footwork and no-warp follower, visor camera, serve aim visuals.
- bennyshub/apps/games/NARBEPICKLEBALL/js/game.js — serve aim controls, continuous pointer movement, help text.
- bennyshub/apps/games/NARBEPICKLEBALL/README.md — behavior and verification.
- bennyshub/ACCESSIBILITY.md — added the missing NARBE Robot Pickleball row (F-drive copy only had Pickleball Rally).
- tests/rally-model.test.cjs — replaced the stale F-drive copy, which already failed (it tested an older first-to-seven/target-mode version), with the maintained desktop test.
- SCAN-UPGRADE-CHANGES.md — this record.

Desktop-only changes: ACCESSIBILITY.md (row updated), ELECTRON-SCAN-UPGRADE.md, new Node-only tests/rally-arm-rig.test.cjs, tests/rally-game-controls.test.cjs, tests/rally-visual-review.cjs and tests/rally-stroke-tuner.cjs; tests/rally-arm-poses.cjs removed (superseded; it read arm internals that no longer exist). Backup: desktop tmp/rally-arm-rebuild-backup (desktop sources before this change; F-drive sources, ledger and accessibility guide before sync). The unfinished attempt's backup remains at tmp/rally-attached-arm-backup. index.html and style.css are unchanged on both sides.

Validation (Node only; no browser, Electron or GPU on this PC): rally-model 25/25, rally-arm-rig 7/7 and rally-game-controls 10/10 pass on the desktop files and on the synchronized F-drive prototype. A 40,557-frame vertex sweep found no arm or paddle penetration of either robot's own head, torso or legs. Review sheets rendered from the real scene graph were inspected. Not run: tests/rally-browser.cjs, tests/rally-electron.cjs and scripts/check-rally-club.cjs, which may need the new serve-aim step. Ben's physical-switch play test is still needed.

### Follow-up — serve aim covers the whole legal box

Owner feedback: the aim swept only a narrow band near the receiving robot. The target now sweeps the whole diagonal service box (centre line/T to sideline, still never into the other box, which would be a fault) and the serve lands deep, about a metre inside the baseline (model SERVE_DEPTH). The receiving robot waits behind its baseline instead of standing on the target, so wide and T serves make it move. While aiming, the first-person view eases up and zooms toward the far box; the target ring is smaller so it stays inside the lines. Files: model.js, scene.js, game.js, README.md, tests/rally-model.test.cjs (synchronized to the F-drive prototype). Backup of the previous versions: desktop tmp/rally-arm-rebuild-backup/before-serve-aim-wide. Validation: rally-model 25/25, rally-arm-rig 7/7 and rally-game-controls 10/10 on desktop and F-drive copies; serve-aim review renders inspected.


## 2026-10-13 — Pet Pals and Magic Button web catalog import

Owner-requested import from the existing OneDrive Benny's PC Hub into the F-drive web checkout. Copied all 76 game files and the two existing PNG thumbnails. The 74 non-entry files match the source by SHA-256. Both HTML entry points omit the desktop electron-bridge.js script and include the web usage analytics and favicon links. Shared web managers and game controls are unchanged. The original OneDrive/Electron app was only read; it was not edited, installed or launched. Electron port flag: NOT REQUIRED — source is already the desktop implementation.

Added the two original source entries to bennyshub/apps/games/games.json (28 games), added first-position New Game cards to the NARBE House index, and bumped the Hub cache from v39 to v40. The separate SwitchedGames checkout has the two thumbnails, matching cards and JSON data, updated 28-game/four-cause-and-effect counts, and a Simulation category for Pet Pals. Its existing search, favorites, details and launch URL conventions are retained.

Graphics assessment: Pet Pals is a fixed-design 2D pixel canvas with cached layers; Magic Button is a 2D canvas with existing resolution and particle/object bounds (including at most 3,400 sparks, 60 bubbles and 400 bubble particles). No new Three.js/WebGL renderer or graphics setting was introduced. Preserve the source's visual defaults and essential cause-and-effect feedback. These observations are not a performance guarantee; physical-switch and target-device/Raspberry Pi acceptance remain pending.

Validation: website build passed; the release audit found no problems in 2,014 public files; all 1,078 checked Pages links passed; 30 JavaScript syntax checks passed; four thumbnail copies and both manifest entries match OneDrive. All 38 browser checks passed with no runtime errors or missing required assets: blank menu safety, Space/Enter navigation, all three Magic Button scenes, settings, Pet Pals adoption and nested naming, pause, saved-pet reload, search/category filters, details and thumbnails, both homepage iframe launch buttons, and mobile viewport fit. Desktop and mobile renders were visually reviewed. Browser verification details are recorded in tmp/petpals-magicbutton-20261013/browser-report.json in the websites workspace. Pet Pals deliberately probes optional recordings/music and synthesizes absent sounds, as documented in sounds/SOUNDS.md; this is retained from the source. Prepared and verified locally first. The owner subsequently authorized publication with “go ahead”; publish the game assets on NARBE House before the SwitchedGames listings. All 257 tests required by the Pages release workflow pass.

Backup and copy evidence: websites workspace tmp/petpals-magicbutton-20261013/before and copy-verification.json. Prior release ZIPs were validated and retained by the existing build helper.

Changed web files (scope: this import; Electron flag: not required, desktop source unchanged):

- bennyshub/apps/games/games.json
- bennyshub/images/games/narbepetpals.png
- bennyshub/images/games/narbemagicbutton.png
- bennyshub/service-worker.js
- index.html
- SCAN-UPGRADE-CHANGES.md
- bennyshub/apps/games/NARBEPETPALS/css/style.css
- bennyshub/apps/games/NARBEPETPALS/index.html
- bennyshub/apps/games/NARBEPETPALS/js/anims.js
- bennyshub/apps/games/NARBEPETPALS/js/arrange.js
- bennyshub/apps/games/NARBEPETPALS/js/companions.js
- bennyshub/apps/games/NARBEPETPALS/js/core.js
- bennyshub/apps/games/NARBEPETPALS/js/game.js
- bennyshub/apps/games/NARBEPETPALS/js/howtodemo.js
- bennyshub/apps/games/NARBEPETPALS/js/music.js
- bennyshub/apps/games/NARBEPETPALS/js/mypets.js
- bennyshub/apps/games/NARBEPETPALS/js/outings.js
- bennyshub/apps/games/NARBEPETPALS/js/pets.js
- bennyshub/apps/games/NARBEPETPALS/js/petside.js
- bennyshub/apps/games/NARBEPETPALS/js/pixel.js
- bennyshub/apps/games/NARBEPETPALS/js/places.js
- bennyshub/apps/games/NARBEPETPALS/js/props.js
- bennyshub/apps/games/NARBEPETPALS/js/room.js
- bennyshub/apps/games/NARBEPETPALS/js/scan-access.js
- bennyshub/apps/games/NARBEPETPALS/js/scenes.js
- bennyshub/apps/games/NARBEPETPALS/js/school.js
- bennyshub/apps/games/NARBEPETPALS/js/seasons.js
- bennyshub/apps/games/NARBEPETPALS/js/sound.js
- bennyshub/apps/games/NARBEPETPALS/js/sprites.js
- bennyshub/apps/games/NARBEPETPALS/js/tricks.js
- bennyshub/apps/games/NARBEPETPALS/js/ui.js
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-1-puppy-kitten.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-2-teen.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-3-grown-up.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-4-senior.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-1-puppy-kitten.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-2-teen.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-3-grown-up.png
- bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-4-senior.png
- bennyshub/apps/games/NARBEPETPALS/previews/song-cozy-corner.wav
- bennyshub/apps/games/NARBEPETPALS/previews/song-garden-breeze.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-meow-sad.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-meow.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-purr-short.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-purr.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/cat-yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog bark.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog excited.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog friendly.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-adult.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-baby.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-adult.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-baby.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-senior.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-friendly-teen.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-adult.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-baby.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-senior.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-happy-teen.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-senior.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-bark-teen.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-pant.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-panting.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/dog-yawn.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/long purr.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/meow.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/puppy bark.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/puppy excited.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/puppy happy.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/sad meow.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/short purr.wav
- bennyshub/apps/games/NARBEPETPALS/sounds/SOUNDS.md
- bennyshub/apps/games/NARBEMAGICBUTTON/css/style.css
- bennyshub/apps/games/NARBEMAGICBUTTON/index.html
- bennyshub/apps/games/NARBEMAGICBUTTON/js/input.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/main.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/scenes.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/settings.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/sound.js
- bennyshub/apps/games/NARBEMAGICBUTTON/js/ui.js

Changed files in the separate SWITCHEDGAMES checkout (web listing only; Electron flag: not applicable):

- CHANGELOG.md
- index.html
- showcase.js
- images/games/narbepetpals.png
- images/games/narbemagicbutton.png


## 2026-10-14 — Auto starts at full High quality

Scope: requested graphics default correction for both the website and desktop Hub. Auto starts at High, preserves original antialiasing, and adjusts using measured game frame timing. Saved manual choices remain unchanged. The website service-worker cache advances from v40 to v41.

Changed website files (Electron port flag):

- bennyshub/shared/graphics-quality.js — YES, shared behavior applied to both editions.
- bennyshub/index.html — YES, matching explanation in each edition.
- tests/graphics-quality.test.cjs — YES, shared regression expectations and coverage.
- GRAPHICS-QUALITY.md — YES, matching contract and validation limits.
- scripts/check-graphics-games.cjs — desktop counterpart updated in tests/graphics-electron-rendering.cjs.
- scripts/check-graphics.cjs — web only, legacy Auto now resolves to High.
- developer-guide.html — web only, graphics integration contract.
- bennyshub/service-worker.js — web only, cache invalidation.
- SCAN-UPGRADE-CHANGES.md — web only, this change record.

Additional desktop test file: tests/graphics-auto-browser.cjs (can validate website sources using an optional staging overlay; uses a disposable OS-temp working directory). Existing desktop rendering test accepts BENNY_GRAPHICS_TEST_OUTPUT for isolated artifacts.

Validation: 25 desktop graphics/native unit checks and 16 website graphics unit checks passed. Real Chrome Auto/High equality and sustained slow-frame downshift passed in Ballista and P3GL at DPR 2. Basketball/Baseball were blocked by unavailable external THREE/Phaser assets. Electron's test GPU initialization crashed and raised the reported Windows breakpoint dialog; further GUI testing stopped. No target-device benchmark is claimed. Local source changes only; no publish or installer build.


## 2026-10-14 — Remove unreliable Auto; fixed High by default

Scope: user-authorized fallback for both Hub editions after Auto still selected Low. A deterministic reproduction showed a steady 30 FPS stream reaches Standard at about 4.0 seconds and Low at 7.6 seconds. Frame cadence alone does not establish device capacity. The previous start-at-High correction is superseded.

High, Standard and Low are the only graphics profiles. Games still offer Use Hub setting. Fresh/invalid settings default to High; saved shared Auto becomes High; explicit Standard/Low remain. High ignores Basketball's old automatic Low cache. The former shared frame sampler is a no-op compatibility hook.

Changed website files (Electron port flag):

- bennyshub/shared/graphics-quality.js — YES, fixed modes/default and Auto migration.
- bennyshub/index.html — YES, graphics explanation.
- bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html — YES, legacy default inherits Hub and obsolete Auto fallback removed.
- tests/graphics-quality.test.cjs — YES, migration, no downgrade, Basketball resolver and selector coverage.
- GRAPHICS-QUALITY.md — YES, current contract and validation.
- scripts/check-graphics-games.cjs — desktop equivalent updated in tests/graphics-electron-rendering.cjs.
- scripts/check-graphics.cjs — web-only assertions updated.
- developer-guide.html — web-only graphics contract.
- bennyshub/service-worker.js — web-only cache v42.
- SCAN-UPGRADE-CHANGES.md — web-only change record.

Additional desktop changes: bennyshub/shared/native-settings.cjs (default and durable Auto migration), tests/graphics-native.test.cjs, tests/graphics-electron.cjs, tests/graphics-electron-rendering.cjs and tests/graphics-auto-browser.cjs (web/browser integration harness, including actual Basketball Hub iframe and optional test-only CDN assets).

Validation on 2026-10-14: all 24 desktop graphics/native unit checks and 14 website graphics unit checks passed. Real Chrome checks passed for Basketball, Ballista, P3GL and Baseball at DPR 2. Checks covered saved Auto migration, inherited High, full launch antialiasing, 30/25/10 FPS synthetic cadences without downgrade, explicit Low and return to Hub. Basketball additionally passed actual Hub selector cycles and iframe Settings cycles, retained High after ten seconds, and had full post-processing and shadows. The screenshot confirms Use Hub setting (High). No Electron GUI process was launched in this follow-up.

Local source update only; no publication or installer build.


## 2026-10-16 — Robot Football yardage and Show n Sound SVG textures

Scope: requested whole-number yardage announcements and investigation/fix of shared images appearing as black boxes. The owner also explicitly requested the Robot Football fix in Benny's PC Hub. Field-goal distances, gains/losses and down-and-distance announcements round to the nearest whole yard; simulation precision and first-down decisions remain unchanged.

Show n Sound uses WebGL textures while Matchy Match uses HTML images. Eight viewBox-only SVGs decode as browser images but fail direct WebGL texImage2D upload with INVALID_VALUE (1281): Cardinal, Hibiscus, Cherry Blossom, Crab, Pufferfish, Police Car, Speedboat and Snowflake. Show n Sound now rasterizes SVGs to a canvas before texture upload, preserving aspect ratio and transparency. Shared artwork and Matchy Match are unchanged. Both file URLs and editor data URIs are supported.

Changed files (scope / Electron port flag):
- bennyshub/apps/games/ROBOTFOOTBALL/js/ui.js — yardage presentation / YES, matching focused patch applied and verified in PC Hub.
- bennyshub/apps/games/ROBOTFOOTBALL/js/simulation.js — result narration only / YES, matching focused patch applied and verified in PC Hub.
- bennyshub/apps/games/BENNYSSHOWNSOUND/js/scenes.js — SVG decoding and texture creation / PENDING, website only in this task.
- SCAN-UPGRADE-CHANGES.md — this record / WEB ONLY.

Validation: all 265 panel images referenced by Show n Sound loaded and uploaded to WebGL without errors after the fix; the original audit reproduced exactly eight failures. Crab reveal and wheel screenshots inspected; embedded percent-encoded/base64 SVGs, query/hash URLs, non-square aspect ratio, transparency and failed-image fallback passed. Twelve home/away simulation checks verified rounded speech while preserving fractional stats and positions. Actual menu/scan/result speech passed in isolated Edge for web and staged PC Hub sources (the applied desktop files were then verified byte-for-byte), including 8.999999999, 6.4, 4.5, 48.9-yard field goals and positive/negative gains. No Electron GUI or installer build was run. The owner requested pushing the verified website fixes after validation. Game assets are outside the service worker's named cache; no cache revision needed.

Backup: [local websites workspace]/Website Backups/Football-yardage-show-sound-20261016-1792154986166
Evidence: artifacts/yardage-show-sound (image audits, browser speech results and screenshots).


## 2026-10-17 — RTC Lite website and reusable BYOK Worker

Scope: owner-requested RTC Lite addition to the web Tools catalog, its own screenshot, bio editing without a quiz, and the first app integration with a reusable Cloudflare BYOK service. The working desktop app was copied into this website and adapted to the web dictionary, shared scanner and separate Worker setup. The Electron source/runtime was not edited or launched.

Cloud keys are entered on the Worker origin, encrypted in per-browser SQLite Durable Object vaults and accessed through revocable app tokens. The Worker accepts only bounded RTC Lite operations with fixed provider endpoints/models. Keys and grants expire in 30 days. Request text is not persisted; request logging is disabled. Source is public-ready; encryption secrets, user keys and runtime state are excluded. Setup explains provider costs, Cloudflare/provider processing, same-origin token trust and deletion/retention limits.

The local speech picker offers Whisper, browser online speech and Off. The bio editor supports typing or the predictive keyboard. Dictionary fallback reads the existing web_keyboard_predictions.json without adding canned words. Local AI/server options remain. The service worker advances v42 to v43; large local runtimes cache only when used. Original bundled runtime files remain intact; the missing Apache TVM NOTICE/LICENSE are now included and manifest-hashed. Model downloads still follow upstream model revisions; no new application-level weight integrity guarantee is claimed.

Changed/added files (scope / Electron port flag):
- SCAN-UPGRADE-CHANGES.md — change record / NO, website only.
- bennyshub/apps/tools/rtc-lite/README.md — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/RTC-LITE-CONTEXT.md — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/THIRD-PARTY-NOTICES.txt — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/ai-generation.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/ai-worker.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/api-server.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/app.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/core.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/dictionary.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/index.html — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/providers.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/speech.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/APACHE-2.0-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/KOFFI-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/LOGLEVEL-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/ONNX-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/PARAKEET-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/SHERPA-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/TRANSFORMERS-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/TVM-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/TVM-NOTICE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/WEBLLM-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/WHISPER-LICENSE — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/manifest.json — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/ort-wasm-simd.wasm — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/ort-wasm.wasm — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/transformers.js — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/vendor/webllm.js — preserved third-party runtime/license asset / NO, website only.
- bennyshub/apps/tools/rtc-lite/web-config.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/rtc-lite/whisper-worker.js — RTC Lite web app and documentation / NO, website only.
- bennyshub/apps/tools/tools.json — Tools catalog / NO, website only.
- bennyshub/images/tools/rtc-lite.png — RTC Lite app screenshot / NO, website only.
- bennyshub/service-worker.js — app shell cache and on-demand runtime cache / NO, website only.
- bennyshub/shared/byok-client.js — shared browser connection client / NO, website only.
- scripts/build.cjs — preserve suffix-named license/notice files / NO, website only.
- scripts/prepare-github.cjs — include Worker sources; exclude local state; scan TypeScript / NO, website only.
- workers/byok/README.md — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/package-lock.json — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/package.json — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/assets.d.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/rtc.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/setup-client.txt — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/setup.html — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/setup.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/util.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/vault.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/src/worker.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tests/browser.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tests/fixture.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tests/worker.test.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tools/initialize-vault.mjs — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/tsconfig.json — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/worker-configuration.d.ts — BYOK service, setup, deployment or verification / NO, website only.
- workers/byok/wrangler.jsonc — BYOK service, setup, deployment or verification / NO, website only.

Validation: all 257 existing website unit tests and five workerd BYOK integration cases passed. TypeScript and Wrangler dry build passed. Real Chrome tested first-party popup setup with third-party cookies blocked, key exclusion from app storage/requests, bio use, board context, prediction selection followed by changed suggestions, real dictionary loading, Space/Enter row navigation, Hub iframe launch/connect/exit, and keyboard fit at 1366×900, 1280×800, 1024×768 and 800×600. GUI launch used a disposable OS-temp working directory and cleaned only that runtime. Tests used synthetic provider responses; no real model quality, microphone or Surface performance result is claimed.

The Pages build, release audit (2,046 public files; no problems), link check (1,096 references; no issues), source credential scan and all 15 vendor-manifest checks passed. Prior Companion release ZIP checksums were preserved. Browser evidence is in artifacts/rtc-lite.

Deployment: bennys-hub-byok is live at https://bennys-hub-byok.narbehousellc.workers.dev. The encryption secret was generated in memory into Cloudflare, not saved locally. Live health, security headers, denied requests, preflight and a disposable synthetic-key vault/connect/delete round trip passed; that test vault was deleted and no upstream provider call was made. No other Worker was modified, no plan was changed, and the website changes have not been committed or pushed to GitHub.


## 2026-10-19 — Custom communication voices and Hub-only reverse toggles

Scope: owner approved custom communication voices in the website and Benny's PC Hub, with held Enter backward cycling confined to multi-value Hub menu controls. This explicitly authorizes the focused desktop pass. Imported the brother's pocket-keyboard-voice work at 76e777034392c25175eb4ef58ecb9c2b2b19f499 selectively, preserving newer web Faster voices, phrase caching and timing. Added a switch-accessible file-picker warning; custom voices/names stay local. The separate Pocket worker reuses its model across Custom voices and cancels obsolete requests. No game controls, shared scanner, Companion speech code, release ZIP contents, or installed executables changed.

Changed web files (Electron port flag in parentheses):
- `bennyshub/ACCESSIBILITY.md` — DOC / mirrored in desktop ACCESSIBILITY.md.
- `bennyshub/index.html` — HUB / selectively adapted in PC Hub source.
- `bennyshub/service-worker.js` — WEB ONLY / no desktop copy needed.
- `bennyshub/shared/communication-settings.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-speech.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-vendor/THIRD-PARTY-NOTICES.txt` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/graphics-quality.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/scan-settings.js` — SHARED / implemented in PC Hub source.
- `docs/development/COMMUNICATION-SPEAKER.md` — WEB ONLY / no desktop copy needed.
- `scripts/audit-release.cjs` — WEB ONLY / no desktop copy needed.
- `scripts/check-communication-speaker.cjs` — WEB ONLY / no desktop copy needed.
- `tests/communication-cache.test.cjs` — WEB ONLY / no desktop copy needed.
- `tests/communication-speech.test.cjs` — WEB ONLY / no desktop copy needed.
- `bennyshub/shared/communication-pocket-worker.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-pocket.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-vendor/POCKET-WEB-DEMO-LICENSE.txt` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-vendor/sentencepiece.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-voices.js` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-voices/a2.bin` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-voices/a5.bin` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-voices/b2.bin` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/communication-voices/b4.bin` — SHARED / implemented in PC Hub source.
- `bennyshub/shared/hub-toggle-cycle.js` — SHARED / implemented in PC Hub source.
- `scripts/check-hub-custom-voices.cjs` — WEB ONLY / no desktop copy needed.
- `tests/communication-pocket-case.test.cjs` — TEST / copied to PC Hub.
- `tests/communication-voices.test.cjs` — TEST / copied to PC Hub.
- `tests/hub-toggle-cycle.test.cjs` — TEST / copied to PC Hub.
- `docs/history/DEVELOPMENT-HISTORY.md` — change ledger / desktop counterpart updated.

Additional desktop files: `ACCESSIBILITY.md`, `ELECTRON-SCAN-UPGRADE.md`, `bennyshub/shared/communication-native.cjs`, `bennyshub/shared/content-security-policy.cjs`, `tests/communication-native.test.cjs`, `tests/communication-policy.test.cjs`, `tests/communication-electron.cjs`. Native persistence accepts validated custom voice metadata and names; the existing model redirect allowance is extended only to the local Pocket worker. Tests cover native restart, bad metadata, removal and the scoped worker policy.

Validation: 355/355 web unit tests; 15 focused desktop unit tests plus 7 native persistence/policy tests; 14 real Chromium UI checks for each final source tree; 2 focused actual Electron CPU fixture flows using real preload/IPC and disposable settings (audio hardware mocked). The unmocked browser Pocket worker produced bundled audio (46,080 samples at 24 kHz) and imported-voice audio (26,880 samples) with nonzero peaks and an identical cached repeat. Desktop/narrow screenshots inspected. Build and public audit passed (3,814 files; 513,092,788 bytes; no problems). All 1,188 page references passed. The broader existing Electron suite stopped on a detached Hello tile in its Phrase Board fixture, before the new custom flow; the focused new-feature mode passes. Physical switch/speaker listening and a packaged installer were not tested/built. Website changes are local and not pushed.

Backups and review evidence: task folder `../tmp/hub-custom-voices-20261019/` (original files, staged native changes, SHA-256 manifests, renderer reports and real-audio report). Every applied desktop file was checked against its reviewed original and verified by hash after copying.


## 2026-10-19 ? Custom voice readiness after automatic preview

The Pocket worker cancels background preparation when a voice preview supersedes it. The sample could play successfully while Settings still showed Custom Upbeat 2 (not ready), because only preparation responses marked the voice ready. Successful synthesis now also marks the current voice ready, guarded by the settings revision and selected voice. Failed, cancelled and obsolete requests cannot make a different voice ready.

Changed files (Electron port flag):
- `bennyshub/shared/communication-speech.js` ? SHARED / same focused correction applied to PC Hub source.
- `bennyshub/service-worker.js` ? WEB ONLY / v58 refreshes the shell while retaining downloaded voice models.
- `tests/communication-readiness.test.cjs` ? TEST / copied to PC Hub; exercises the real Pocket worker queue, service, playback channel and Settings renderer with substituted inference and audio hardware.
- `tests/communication-cache.test.cjs` ? WEB TEST / verifies v57 retirement and model-cache preservation.
- `scripts/check-hub-custom-voices.cjs` ? WEB TEST TOOL / models preview cancellation and verifies the visible ready label on both source trees.
- `docs/history/DEVELOPMENT-HISTORY.md` ? change ledger / desktop counterpart updated in ELECTRON-SCAN-UPGRADE.md.

Verification: the exact Custom Upbeat 2 regression failed before the fix and passes afterward. All 358 website unit tests, six focused desktop unit tests, and 15 browser checks on each source tree pass. No model, voice print, audio generation, playback routing or scan behavior changed. No desktop installer rebuilt. Desktop backups and browser evidence: ../tmp/hub-voice-readiness-20261019/.


## Mini Golf — 54 holes and course-side clearance (2026-10-19)

Scope: owner requested all three existing nine-hole themes expanded to 18, longer winding layouts with sparse obstacles and gradual challenge, course-side clipping repaired, and elevation-safe aiming. Owner also requested Benny's PC Hub. The web source is implemented and verified. After the owner explicitly instructed "start the Electron pass", the backed-up 16-file desktop update was applied and SHA-256 verified in Benny's PC Hub. Backups and evidence remain at `../tmp/minigolf-18-20261019`. Earlier automatic-approval rejections are resolved.

Changes (Electron port flag: APPLIED to PC Hub source):

- `bennyshub/apps/games/NARBEMINIGOLF/tools/build-courses.cjs` — nine new authored holes per theme; sparse obstacles, longer turns/loops, optional shortcuts; repair original water, walls, tunnels and windmill footprints; deterministic in-lane surface polygons.
- `bennyshub/apps/games/NARBEMINIGOLF/courses/sunny_meadows.json`, `courses/sunset_lagoon.json`, `courses/glow_golf_night.json` (same game folder) — 18 holes each; retain course identities and original front-nine order.
- `bennyshub/apps/games/NARBEMINIGOLF/js/course.js` — shared full-footprint side-clearance validation, including animation/trim allowances.
- `bennyshub/apps/games/NARBEMINIGOLF/js/scene.js` — keep painted banks/boost overlays within the fairway, place scenery by full generated radius including lamp halos, lower surrounding lawn below bowls and cup liners, and extend the plinth accordingly.
- `bennyshub/apps/games/NARBEMINIGOLF/js/fx.js` — terrain-following tessellated arrowhead and aiming overlay materials that remain visible over terrain and bridges.
- `bennyshub/apps/games/NARBEMINIGOLF/js/game.js` — full-round best scores keyed by hole count, retaining old nine-hole records.
- `bennyshub/apps/games/NARBEMINIGOLF/js/ui.js`, `css/style.css`, `index.html` (same game folder) — readable front/back scorecards and full totals, dynamic record lookup, initial 18-hole HUD; existing scan/control ownership unchanged.
- `bennyshub/apps/games/NARBEMINIGOLF/tools/check-clearance.cjs` — regression check for 54 layouts, back-nine route-length growth, terrain/bridge aiming geometry and record separation.
- `bennyshub/apps/games/NARBEMINIGOLF/DESIGN.md` — current 18-hole design and checks.
- `bennyshub/apps/games/games.json` — only Mini Golf's description updated to 54 holes.
- `bennyshub/images/games/narbeminigolf.png` — actual hardware-rendered screenshot of the repaired Lily Pad Bridge.
- `docs/history/DEVELOPMENT-HISTORY.md` — this record (WEB ONLY).

Verification: 54/54 compiled boundaries, 54/54 roomy routes (65px from water/sand and 28px from rails/walls/bushes), 54/54 opening aims plus up to 60 resting locations per hole, 120 hill/bridge arrow cases. Hardware Edge (NVIDIA RTX 5070 Ti, D3D11; software rasterizer disabled) inspected 3,162,133 actual scene vertices across all 54 holes, zero side violations. Sampled gator validation: 132 nearby ball spots, 23 viable plans, six attacks checked vertex by vertex, zero faults. Actual keyboard charge/putt/pause, hole 9→10 continuation/save, hole 18 completion/record/clear-save, desktop and 430px-wide scorecards, and High/Standard/Low/Hub settings passed without browser exceptions. Low remained below its 921,600-pixel cap. Web suite: 358/358 tests; build passed; public audit 3,814 files with zero problems (known vendor false positives only); all 1,188 page references passed. Full solver completed all 54 holes in 1–3 expert strokes; four imperfect-shot trials per hole showed gradual back-nine growth. Reviewed all 25 par suggestions: raised Mangrove Maze to 4, Twin Coves to 5 and Orbit Switchback to 5; retained the other 22 higher pars as deliberate breathing room. Final course pars: 54, 61, 60. Four-player hole 18 completion passed for all players; the compact scorecard displays every row and total at 1280×720 and 430×820 without vertical scrolling.

No website push/deployment, native Electron GUI, installer build, physical-switch or Raspberry Pi test is claimed. Original game/PC files, thumbnail, catalog and ledgers are backed up outside the published tree. Release archives retain the existing Companion SHA-256.


### Mini Golf follow-up — no-click hover and touch direction (2026-10-19)

Owner clarified that moving the pointer over the course must show its aim direction without requiring a click. Implemented mouse/pen hover and touch placement/dragging, including the Easy Pause ready preview without selecting its Putter/Pause choices. Pointer-owned charging permits dragging; keyboard-held charging remains locked. A primary pointer owns the gesture; cancel, lost capture, blur, hidden page and pause discard its charge. Deliberate pointing holds its direction against the automatic sweep; a switch press or new turn restores switch aiming. Picking is batched per rendered frame and uses actual carpet, bridge decks and water, with fairway/pond-mask filtering and an exact-triangle-seam retry.

Changed files (all game-relative; Electron port flag APPLIED to PC Hub source): js/ui.js (hover events, gesture ownership, cancellation and Help text); js/game.js (ready/aim/pointer-charge direction and sweep ownership); js/scene.js (surface picking); DESIGN.md (controls). docs/history/DEVELOPMENT-HISTORY.md is WEB ONLY. The 16-file PC manifest includes the hover changes. The earlier “ok sure” approval was rejected by automatic review; the owner subsequently supplied “start the Electron pass”, and the guarded desktop application succeeded.

Verification: actual hardware Edge mouse movement with no clicks changes the visible line and consumes no strokes; Easy Pause keeps its choice scan while previewing. Real CDP touch placement, drag during charge, cancel, one-stroke release; switch takeover; pause/blur cancellation passed. Mouse picking tested at 362 locations across all 54 holes, including hills, bridge decks and the deep bowl, plus outside-course rejection; maximum location error 0.009 course pixels. Final narrow 430x820 Low/overhead touch and Easy Pause hover passed after the resize transition settled. No browser exceptions. Screenshots and JSON interaction/picking reports are under ../tmp/minigolf-18-20261019. The 358-test suite and 54-hole/120-arrow clearance checks passed; the final 358-test suite and rebuilt web output also passed. Web changes remain local and unpublished; PC source now includes the same tested changes, preserving its native bridge.


### Mini Golf desktop application completed (2026-10-19)

The owner supplied "start the Electron pass". All 16 reviewed PC files were applied and independently verified by SHA-256; the 12 shared source files match the web version, and the PC entry retains its native bridge. The installed PC source passes all 54 boundary checks and 120 hill/bridge aiming cases. Actual Electron passed 13 focused checks with production preload/native settings in an isolated hidden fixture using NVIDIA RTX 5070 Ti D3D11 hardware: three 18-hole courses, mouse hover without clicking, Easy Pause preview, pointer/switch ownership, touch drag during charge, cancellation, one-stroke release, pause/Continue, and accurate visible aiming on a hill, bridge and deep bowl. No game-page exceptions; the successful test profile was disposed. Restricted native launches stalled, and the permitted elevated test launch passed. Evidence: electron-minigolf-report.json, electron-hover.png and electron-bowl-hover.png in the task folder. This supersedes the earlier pending/native-not-tested status. PC ledger ELECTRON-SCAN-UPGRADE.md records these results. No installer rebuilt, no website published, no physical switch or Raspberry Pi test claimed.


### Glow Pop and Switch Stories publication — 2026-10-22

The owner requested a real Glow Pop screenshot and PC Hub catalog entry, plus both games in the F-drive web app, Narbehouse homepage and SwitchedGames catalog. Glow Pop now has a 1280×720 screenshot captured from its default menu in an isolated Electron runtime. Both website catalogs credit Nancy; Switch Stories also identifies the Let’s Read adaptation and CC BY-NC 4.0, with complete original-contributor and adaptation credits retained inside Froggy.

The web editions use the existing browser shared platform, usage analytics and favicons, without the native Electron bridge. Switch Stories uses the already optimized WebP artwork; originals and production materials remain in the excluded local reference archive. Its library requests six images at startup, with the selected book’s complete artwork requested when opened. The service-worker cache advances to v62. These inexpensive 2D games preserve their existing rendering, dimensions, controls, timing and access settings; no graphics-quality selector was added. Physical-switch and Raspberry Pi hardware acceptance remain untested.

Changed-file scope and Electron port flag: the accompanying [complete file inventory](NANCY-GAMES-20261022-FILES.json) lists every added or changed web file, its size/hash and desktop scope, plus the separately maintained SwitchedGames index and PC Hub files. Desktop changes are the Glow Pop manifest entry, screenshot and reproducible screenshot fixture; no installer was rebuilt. Browser-only entry integration, selected-book loading and new credit documents were not ported back to desktop. Original changed catalogs and build/test files were backed up before edits. Existing Companion release ZIP remains byte-for-byte unchanged.

Validation: 394/394 website unit checks passed; the build passed with 4,060 public files totaling 604,459,135 bytes; the release audit found no problems; all 1,245 public references passed exact-case checks. The required-artwork browser check decodes every explicit image from all three books. All 50 Chrome gameplay/settings/layout/catalog checks passed, with no JavaScript exceptions; evidence is recorded in artifacts/nancy-games/report.json. The preserved 320px Lily floor-seam assertion documented in ASSET-OPTIMIZATION.md predates the image conversion and is outside this catalog/port change.


### Gameplay thumbnail replacements — 2026-10-22

Replaced the existing Glow Pop, Switch Stories and Magic Button menu thumbnails with real 1280×720 gameplay captures: a ladybug pop, Lily using her tablet and switch, and fireworks over the city. The three existing filenames are overwritten in both PC and web folders. No alternate thumbnail files or copies of the old images were created. Catalog image URLs use a content version to refresh previously cached images.

Changed files and Electron port flags:

- bennyshub/images/games/glowpop.png, switchstories.png and narbemagicbutton.png — APPLIED to PC Hub and web with identical bytes.
- bennyshub/apps/games/games.json and index.html — WEB ONLY image URL versions; existing filenames, game paths and descriptions retained.
- docs/history/DEVELOPMENT-HISTORY.md — WEB ONLY, this record.
- SwitchedGames index.html — static cards and Details image URLs use the same new content versions.
- PC tests/glowpop-thumbnail-electron.cjs — updated the existing capture helper to take gameplay frames in an isolated temporary runtime.

Validation: actual gameplay/story states asserted before capture; all images inspected; SHA-256 compared across PC and web; all three hashes differ from the former images. No gameplay or access behavior changed. Publication uses the existing reviewed Pages workflow.


### Approved unused-media cleanup - 2026-10-22

Owner approved removal of exactly the Bowling background recording, Pet Pals preview media and the old Pickleball Rally thumbnail. Removed 12 tracked media files totaling 21,166,507 bytes (20.19 MiB). Bowling ambient playback was already disabled; Pet Pals uses generated music or optional sounds/music-<id>.mp3, and the catalog already uses narbe-pickleball-2026-10.png. No runtime code or control behavior changed. Deleted content remains recoverable from parent commit 7e96bc0abe470fdfc43e5051c3cac340b79405be.

Changed files and Electron port flags (all WEB ONLY / NO ELECTRON PORT):

- `bennyshub/apps/games/BENNYSBOWLING/sound/bowling-bg.wav` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-1-puppy-kitten.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-2-teen.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-3-grown-up.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-cats-4-senior.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-1-puppy-kitten.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-2-teen.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-3-grown-up.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/legs-before-after-dogs-4-senior.png` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/song-cozy-corner.wav` - removed unused media.
- `bennyshub/apps/games/NARBEPETPALS/previews/song-garden-breeze.wav` - removed unused media.
- `bennyshub/images/games/pickleballrally.png` - removed unused media.
- `bennyshub/apps/games/BENNYSBOWLING/README-ACCESSIBLE.md` - document disabled ambience and remove the obsolete required-file entry.
- `bennyshub/apps/games/BENNYSBOWLING/CREDITS.md` - retain the historical ambient-file credit while identifying it as removed.
- `docs/history/DEVELOPMENT-HISTORY.md` - this cleanup record.

Scope: retain tests, dependencies, local profiles, artifacts, backups, historical release ZIPs and all other media. No Electron files changed.

Validation: 394/394 unit tests passed. Rebuilt public output contains 4,048 files and 583,041,849 bytes; the release audit reports zero problems and all 1,245 exact-case page references pass. Every approved file is absent from both source and dist. All 22 historical release ZIPs retain their pre-cleanup SHA-256 hashes. In an isolated Chrome browser, Bowling progressed through Play Game > setup > Start Game with zero page errors or missing resources and ambience still disabled. Pet Pals progressed through Play > Puppy > Labrador > Rocky to gameplay; generated music played, eight music tracks were ready, and no removed preview assets were requested. Its existing optional audio probes remain, as documented. Gameplay renders were inspected. The later interactive pause probe exceeded the tool timeout; pause controls were not changed and are not claimed as regression-tested here. Browser evidence, checks and release hashes are saved outside the website under ../tmp/narbe-cleanup-assessment-20261022/.


## 2026-10-22 — Codex physical build project page

Scope: standalone project story for Benny’s Hub Mobile, linked only from the NARBE homepage. No Hub/Companion/SwitchedGames behavior changes. Electron port: **No** for every file below.

- `codex-physical-builds/index.html`, `styles.css`, `script.js`, `favicon.svg`: responsive project story, real photographs/UI captures, hardware and source links, two-switch illustration, image dialog, accessible setup disclosures and copyable commands.
- `codex-physical-builds/README.md`, `trinkey/README.md`: current setup documentation and explicit pending firmware/runtime validation.
- `codex-physical-builds/images/*.jpg`: compressed derivatives of six supplied photos and four genuine Hub captures (graphics, speakers, keyboard, personal streaming library). Original PNGs and supplied documents remain unchanged.
- `index.html`: one project feature linking to the standalone page.
- `scripts/build.cjs`: include the project in the reviewed public build, publish JPEGs while excluding original PNG source copies. Existing rules exclude supplied DOCX/Markdown handoff files.
- `scripts/serve.cjs`: serve the new project under the existing local preview.
- `docs/history/DEVELOPMENT-HISTORY.md`: this record.

Validation: 394/394 repository tests passed; public build passed; release audit found no problems; all 1,271 local page/asset references passed. Real Chrome review covered desktop and 390/320 px phone widths with no horizontal overflow, loaded project imagery, the homepage-to-project link, mouse/Space/Enter switch illustration, image-dialog Escape and focus return, setup disclosures/deep links and copy-button success feedback. Browser error log was empty. Six photo JPEGs plus four Hub screenshots total approximately 1.15 MB. No Pi runtime, battery benchmark or new hardware acceptance is claimed.


### 2026-10-22 — Physical build relationship and entertainment notices

User-requested clarification. Electron port: **No** for every file. `codex-physical-builds/index.html` adds visible bottom-of-page notices describing the limited OpenAI relationship, no implied endorsement, entertainment-only intended use, no AAC/medical marketing claims, and limits on relying on speech/Help features. `codex-physical-builds/styles.css` provides readable responsive notice styling that also prints. `codex-physical-builds/README.md` repeats the same notice. Generated `dist/codex-physical-builds/index.html` and `styles.css` are synchronized. `docs/history/DEVELOPMENT-HISTORY.md` records this change. This wording describes intended use; it does not purport to determine regulatory classification.

Verification: all 1,271 local page/asset references pass; git diff whitespace check passes. Browser review confirms readable two-column desktop and single-column 390 px layouts with no horizontal overflow. Existing application behavior is unchanged.


### 2026-10-22 — Personal context for Ben’s build

User-supplied background added to `codex-physical-builds/index.html` and `codex-physical-builds/README.md`: Ben is nonspeaking and quadriplegic due to a rare condition, uses right/left head movements for yes/no, and spent years without suitable computer access. The story connects AI-assisted development to more choice in his day while preserving the screen/switch explanation. Generated `dist/codex-physical-builds/index.html` synchronized. `docs/history/DEVELOPMENT-HISTORY.md` records the edit. Electron port: **No** for every file. No diagnosis name, clinical outcome, direction-to-answer mapping or new medical claim added.


### 2026-10-22 — Correct physical-build Hub screenshots

Replaced captures that incorrectly showed the outer Hub or top of Settings instead of the intended screen. Changed `codex-physical-builds/images/hub-library.jpg`, `hub-graphics.jpg`, `hub-speakers.jpg` and `hub-keyboard.jpg` to verified viewport captures of the real Streaming library, Graphics quality control, Speakers section and complete keyboard. Updated `codex-physical-builds/index.html` with the actual 914 × 814 image dimensions and a caption explaining the visible Speaker Mode off state. Synced the same five generated files under `dist/codex-physical-builds/`. `docs/history/DEVELOPMENT-HISTORY.md` records the correction. Scope: project presentation only; Electron port: **No** for every file. No Hub preferences were changed.

Verification: inspected saved image files, confirmed all four load at their declared dimensions on the project page, visually reviewed the gallery and enlarged Speakers image, confirmed no browser errors, and checked all 1,271 local references without issues. Source/build image bytes match. Prior captures and verification evidence are preserved outside the repository under ../tmp/codex-physical-builds-20261022/.


### 2026-10-22 — Publish the physical-build project

Owner authorized publication of the reviewed project page and homepage entry. Added `codex-physical-builds/.gitignore` to preserve the supplied write-up, handoff notes and original PNG photos locally while committing the finished page, setup README and compressed website images. `docs/history/DEVELOPMENT-HISTORY.md` records the publication scope. Electron port: **No** for every file. Publication uses the existing main-branch GitHub Pages workflow, including its tests, release audit and page-reference checks.


### 2026-10-22 — Credit OpenAI’s Raspberry Pi contribution

Owner confirmed that OpenAI’s Codex Physical Builds project supplied the Raspberry Pi. `codex-physical-builds/index.html` now credits the hardware contribution beside the Pi and explicitly includes it in the relationship notice. `codex-physical-builds/README.md` repeats the credit and updated notice. The endorsement clarification includes hardware support. Generated `dist/codex-physical-builds/index.html` synchronized. `docs/history/DEVELOPMENT-HISTORY.md` records the edit. Scope: factual attribution only; Electron port: **No** for every file. The copy does not assert cash sponsorship, an employment relationship or clinical validation.


### 2026-10-22 — Clarify the Pi as a supplement to Ben’s Surface

User clarified that Ben continues using his main Electron app on Surface Pro. `codex-physical-builds/index.html` updates the introduction, description, upgrades transition and current-limits section to present the Raspberry Pi as a portable supplement running the web Hub. It distinguishes YouTube-only web search from his broader desktop search app and states that his Discord-mirroring messenger has no implemented web version. Future web support is exploratory, with feasibility unresolved and no delivery commitment. `codex-physical-builds/README.md` carries the same scope and limitations; its project URL is now labeled as published. Generated `dist/codex-physical-builds/index.html` synchronized. `docs/history/DEVELOPMENT-HISTORY.md` records the edit. Scope: project copy only; Electron port: **No** for every file.

Layout follow-up in `codex-physical-builds/styles.css`: add space below the current-limits heading before the new introductory paragraphs; generated CSS synchronized. Electron port: **No**.

Verification: all 1,271 page/asset references and whitespace checks pass. Reviewed desktop and 390 px phone layouts; no horizontal overflow, and the new search/messenger limitations remain readable.


### 2026-10-22 — Identify TV mirroring as a testing setup

User clarified the TV display in the “Hi everyone” photograph was used for testing. Updated `codex-physical-builds/index.html` caption, image alt text and enlargement label to distinguish that test from the default portable setup. `codex-physical-builds/README.md` documents the same distinction; generated `dist/codex-physical-builds/index.html` synchronized. `docs/history/DEVELOPMENT-HISTORY.md` records the change. Scope: factual photo context only; Electron port: **No** for every file.


### 2026-10-22 — Use shared NARBE House game attribution

Removed separate personal creator credits for Switch Stories and Glow Pop at the owner's request. `index.html` removes the individual card credits; `bennyshub/apps/games/games.json` removes them from Hub descriptions; `bennyshub/apps/games/NARBESWITCHSTORIES/CREDITS.md` and `bennyshub/apps/games/NARBEGLOWPOP/CREDITS.md` credit NARBE House. Synced the same four paths under `dist/`. `../SWITCHEDGAMES/index.html` removes the individual credits from cards and the embedded detail catalog. `scripts/check-nancy-games.cjs` now checks that the separate personal credit is absent on the homepage and in SwitchedGames details. `docs/history/DEVELOPMENT-HISTORY.md` records the change. Scope: website attribution copy and its existing regression assertions; Electron port: **No** for every file. Story-source and license attribution, family/about copy, and historical records remain intact.

Verification: both game catalogs parse successfully; all 1,271 local page/asset references pass; the modified browser-check script passes syntax checking; whitespace checks pass in both repositories. Browser review confirmed both NARBE House cards and both SwitchedGames detail dialogs omit the individual credit, with the Switch Stories source/license information preserved. Generated copies match their source files. The full gameplay regression script was not rerun for this copy-only change. The owner subsequently authorized publication of the Foundation, SwitchedGames and NARBE House updates through their existing main-branch GitHub Pages workflows.


### 2026-10-22 — Explore the Codex physical build with switches

User requested that visitors experience the project page with the same Space/Enter inputs used by Ben. Scope: the physical-build presentation and its local switch controls only. Electron port: **No** for every file. Backups of the original page, styles, script and README are preserved outside the repository at ../tmp/codex-builds-switch-access-20261022/.

Changed files:

- `codex-physical-builds/index.html`: adds the visible two-switch invitation, explicit section/group identities, scannable illustration buttons, photo narration, local control and destination dialogs, and the shared Hub scan/voice dependencies. Hub links now use the same origin to preserve saved preferences.
- `codex-physical-builds/switch-access.js` (new): explicit CHOICE contexts through the shared adapter; release-based Space/Enter, three-second manual reverse, recurring silent root blank, nested Back with identity restoration, interruptible passage narration, auto scan/Brake, lifecycle cleanup, and cancel-first link handoff. Native keyboard navigation remains available by pressing Tab or ending switch browsing.
- `codex-physical-builds/script.js`: coordinates image dialogs and copy/sample feedback with the page scanner; removes competing illustration keyboard ownership.
- `codex-physical-builds/styles.css`: responsive switch introduction/dock, strong choice and passage highlights, dotted auto-pause outline, and visible modal Back/status feedback.
- `codex-physical-builds/README.md`: documents controls, architecture, browser/voice requirements and physical-device validation still pending.
- Generated `dist/codex-physical-builds/index.html`, `script.js`, `styles.css`, and `switch-access.js` match their source files.
- `docs/history/DEVELOPMENT-HISTORY.md`: this scope and validation record.

Classification: “If Ben stops pressing, does anything in the game keep happening?” No; every project-page scan is CHOICE. No shared module, Hub gameplay, release ZIP or Electron source is changed.

Verification: all 394 repository tests passed; the full website build and release audit passed (4,063 public files; no release problems). All 1,282 local page/asset references passed. Both local scripts pass syntax checks and the diff passes whitespace checking. Chrome UI checks covered all 15 root choices, the silent/inert blank and reverse scan, nested Back identity, section narration and interruption, enlarged-photo descriptions/close, setup copy and collapse, local voice/auto/speed controls, dotted Brake feedback, speech-off fallback, modal Back, and Tab exit. A switch-only handoff reached the real Hub and its main menu. At 390 × 844 the document had no horizontal overflow and the control dialog fit the viewport. Test settings were restored to spoken feedback On, David, Auto Off, and two-second scan speed. Final small feedback/layout changes were checked in the browser and synchronized to the generated files after the full build.

This is keyboard/browser verification, not a claim of physical-switch, Pi/display, speaker-output or cross-browser acceptance. The complete route still needs a hands-on run with Ben’s actual switches, preferred voice and display. The owner subsequently authorized publication of this switch-browsing update through the existing main-branch GitHub Pages workflow. Physical-device testing remains pending and is not a claimed release result.


### 2026-10-22 — Repair project-page dock scanning and Back targets

The owner reported that Sections and Controls & help were unreachable inside section scans, and Back outlined a large unrelated area. They also requested clearer demonstration wording. Scope: Codex physical-build page only; Electron port: **No** for every file. Original files are preserved at ../tmp/codex-builds-scan-fixes-20261022/. All scan contexts remain CHOICE.

Changed files: `codex-physical-builds/switch-access.js` includes Sections and Help in all content groups, preserves the exact parent when Help closes, renders the shared Back stop as a compact destination label, keeps modal controls in view, disables the already-active start button, and preserves native tab order when scanning ends via Tab or Shift+Tab. `codex-physical-builds/styles.css` supplies the local dashed Back cue and hides the inactive dock behind modal dialogs. The page intentionally replaces the adapter’s aggregate row outline because its choices span the document and fixed dock; shared scan policy and Back semantics are unchanged. `codex-physical-builds/script.js` leaves photo-close focus restoration to the active scanner and keeps the Play/Watch/Speak illustration to one selected option. `codex-physical-builds/index.html` makes the rewritten demonstration introduction scannable/readable and explains the revised controls. The wording distinguishes this demonstration from Ben’s simpler, individually tailored Hub apps. `codex-physical-builds/README.md` documents these behaviors. Generated `dist/codex-physical-builds/index.html`, `script.js`, `styles.css` and `switch-access.js` are synchronized. `docs/history/DEVELOPMENT-HISTORY.md` records scope and validation. No shared modules, Hub apps, Electron files or release ZIPs changed.

Browser verification used real Space/Enter key presses in Chrome. The audit traversed all 14 content sections and 26 nested groups: reading/start-stop, reachable Sections and Help controls, exact Help return, compact visible Back targets and parent restoration. A second pass activated Sections from all 40 groups and verified the containing root selection. It also covered eight photo dialogs, 42 cancel-first link handoffs, all four internal destination routes, five successful copy actions, all three sample choices, setup collapse, all 16 root stops and inert blank, held reverse into Back, forward wrap, Enter/Space speech interruption, completed narration, speech-off fallback, Auto timing and repeated local loops, dotted Brake with selection still available, and native Shift+Tab exit without negative tabindex on links/buttons. At 390 × 844, content had no horizontal overflow and dock/dialog Back cues remained in view. Test preferences were restored to spoken feedback On, David, Auto Off and two-second speed. The audit record and screenshots are saved outside the repository with the backup.

The saved browser audit contains 368 recorded checks. Additional checks verified voice cycling/restoration, spoken instructions, explicit Help return, End switch browsing/restart, Escape dismissal, held Enter producing exactly one action after the shared cooldown, and a single selected sample option. All 394 existing tests, the full build, release audit (4,063 public files; no problems), all 1,282 local references and whitespace checks pass. Hardware/Pi/display/speaker-output and other-browser acceptance remain pending; these browser checks do not claim physical-device verification. Publication follows the owner’s existing authorization for this page’s switch-access update.


### 2026-10-24 — Link optional Trinkey customization from the switch-kit guide

Scope: publish the standalone configurator at /trinkey-configurator/ and connect the Foundation program guide and NARBE House newsletter invitation. Electron port: **No** for every file. The tool is operated with an ordinary mouse and keyboard; no Hub scan behavior changed. Originals of the edited site/build files are backed up outside the repository in ../tmp/trinkey-site-links-before-20261024/.

Changed files:

- `index.html`: the existing Foundation card now invites newsletter signup for Switch Kit Program application announcements and links to https://narbefoundation.org/switchkit.html#newsletter. It does not link directly to the configurator.
- `../NARBE FOUNDATION/WEBSITE PROD/switchkit.html`: adds Optional: Customize Your Switch Bindings inside Getting Started, linking to the configurator and requiring Spacebar plus Enter (Return) for Benny's Hub, SwitchedGames and other Space/Enter apps. Explains Restore defaults followed by Save to Trinkey.
- `TRINKEY-CONFIGURATOR/guide.html` (new), `index.html`, `styles.css`, `README.md`: add/link a customer setup guide and document the deployed route and Space/Enter requirement.
- `scripts/trinkey-public.cjs` (new), `scripts/build.cjs`: validate exact firmware board/file names and SHA-256 hashes, then copy an explicit 18-file runtime list to dist/trinkey-configurator/.
- `scripts/audit-release.cjs`: reject unexpected files in that route; allow only its two required Python startup files and include Python in text scanning.
- `tests/trinkey-public.test.cjs` (new): checks that runtime files are complete, private/development files stay out, and altered firmware fails before publication.
- `.github/workflows/pages.yml`: run the configurator browser/protocol and simulated firmware tests in the existing Pages workflow.
- `TRINKEY-CONFIGURATOR/.gitignore`, `ASSET-NOTES.md`: keep the original image.png reference photograph local and record that exclusion. Existing configurator source, generated illustration, firmware, licenses, development tests and historical release ZIPs are added to source control for the first time; the website build serves only the explicit runtime list. Device backups and artifacts remain excluded.
- `docs/history/DEVELOPMENT-HISTORY.md`: this scope and validation record.

Verification: 396 root tests, 20 configurator JavaScript tests and 14 simulated firmware tests passed. The full build succeeded; the release audit passed with 4,081 public files and no problems; all 1,294 page/asset references passed. Browser review confirmed the optional Foundation card, homepage newsletter card, lowercase configurator route and its setup-guide navigation. This publication pass makes no new claim of physical-device testing.

`TRINKEY-CONFIGURATOR/.gitattributes` preserves firmware and release archive bytes on Windows and Linux so Git line-ending conversion cannot invalidate the pinned installation hashes.


### 2026-10-24 — Keep only website files in the Trinkey folder

Owner requested removal of the launcher and all non-website material from the public repository, with local preservation outside it. Scope: configurator repository cleanup and Foundation wording only. Electron port: **No** for every file. A complete 45-file archive was copied and verified byte-for-byte before removal at ../tmp/trinkey-cleanup-20261024/TRINKEY-CONFIGURATOR/. Historical ZIPs, firmware source, compiler provenance, tests, reference art and device backups remain available locally.

Deleted from `TRINKEY-CONFIGURATOR/`: `START-LOCAL.bat`, `server.cjs`, `package.json`, `README.md`, `ASSET-NOTES.md`, `.gitattributes`, `.gitignore`, `.nojekyll`, `assets/narbe-foundation.png`, `downloads/narbe-trinkey-0.1.0.zip`, `downloads/narbe-trinkey-0.2.0.zip`, `scripts/package.mjs`, `tests/bindings.test.mjs`, `tests/uf2.test.mjs`, `tests/test_firmware.py`, `firmware/narbe_config.py`, `firmware/narbe_runtime.py`, `firmware/compiled.json`, and `firmware/INSTALL.txt`. The ignored local `image.png` and `artifacts/` were also archived and removed from this folder. The 18 runtime files listed in scripts/trinkey-public.cjs remain byte-identical.

`.gitattributes` now preserves the required runtime firmware bytes from the repository root. `.github/workflows/pages.yml` removes references to the archived development tests; the normal website tests, exact-runtime publication checks, firmware hash verification, build and release audit remain active. `../NARBE FOUNDATION/WEBSITE PROD/switchkit.html` replaces "our switch games" with the games on SwitchedGames and Benny's Hub, without explaining the organizations. `docs/history/DEVELOPMENT-HISTORY.md` records the changes.

Verification before push: the folder contains exactly the 18 public-runtime files; every one is byte-identical to the verified archive/deployed version. All three focused publication/build tests and both repository whitespace checks pass. The existing Pages workflow will run the full website tests, build, firmware verification and release/page audits for publication.
