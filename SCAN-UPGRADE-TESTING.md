# Scan upgrade — local test guide

October 4, 2026. This is the web test candidate. Desktop/Electron work and publishing are separate steps.

## Open the current version

1. Open **http://127.0.0.1:4173/bennyshub/** in desktop Edge or Chrome. Refresh with **Ctrl+Shift+R** if the tab was already open.
2. For Companion tools/player controls, open the browser’s Extensions page and reload the unpacked extension from this project’s **extension/** folder. Refresh the Hub and open a new player tab. This source extension supports port 4173; the production ZIP intentionally does not support localhost.
3. In Hub Settings, **Size** follows **Background Theme**, and **Input Sensitivity** sits immediately beside **Auto Scan** (directly below it on narrow screens). Input Sensitivity stays usable with Auto Off.
4. Open Hub **Settings → Scan**. Parking, loop count, Space brake and Wait for speech are managed here. They stay visible and are disabled when Auto is Off; loop count also requires automatic parking. Individual apps keep their existing voice/Auto/speed settings.

If the preview is stopped, run npm start from the project folder and reopen the same address.

## Pass 1 — Step mode

Turn Auto Off. Start with Ballista, then one game and one tool you use often.

- Space steps on release; holding it uses that app’s existing backward-scan gesture.
- Every stationary root menu cycles through one blank stop with no highlight. It stays silent and Enter does nothing there. The next Space reaches the first choice. Check both directions.
- Change a setting: the same setting should remain selected.
- Enter a keyboard/grid row, then Back: it should restore the same parent row. A newly opened menu or a separate settings modal may return to blank.

## Pass 2 — Auto, parking and braking

In Hub Settings, turn Auto On, Space brake On, and choose a comfortable scan speed.

- With Parking Off, the blank stop stays silent and continues to the next item after one full scan interval. Neither “park” nor “parked” should be spoken in the Hub, apps or Companion, even with Wait for speech On.
- With Park when chosen, the blank step can say “park” when speech is On. Press Enter at the blank stop. All choices clear and **Parked** stays visible. Enter resumes at the first choice without activating it.
- With automatic parking, test one loop, then two or three. It parks after that many full loops.
- While a choice is highlighted, press Space. It freezes immediately; the same choice shows only a dotted outline. A short release stays paused. Enter still selects it.
- A second Space tap resumes; holding Space resumes on release at the app’s native threshold. The next item waits a full scan interval.
- Turn Wait for speech On. The next interval starts after the current label finishes. Pause speech should follow a normally completed label, not interrupt it. Check this with your installed voice and physical switch.
- Let scanning move down Settings. Each selected card should move into the visible area above the footer, with space around its outline. Repeat in a smaller window and with larger text. Cards too tall to fit keep their title visible.
- Test the dotted pause outline and Parked badge there. There should be one page scroll and no nested Settings scrollbar. Mouse/touch clicks and changing Size should keep working without losing the selected option.

## Pass 3 — Nested menus and gameplay boundaries

Check main menu, Settings, Pause, Help, result screens and any row/grid choices in your usual apps. Suggested focused checks:

- Keyboard: row → key → row returns to the same row.
- Ballista: kingdoms/custom library, settings and pause.
- Bowling: setup values retain focus; blank → ball → Pause choices work; selecting the ball keeps native positioning, aiming and hold-to-charge.
- P3GL with Choose Play or Pause: blank → Pause/Options → Take Shot. Aiming still uses the existing controls.
- Fish Mystery and Mini Golf: stationary menus use the policy; existing fishing/aim/hold mechanics stay the same. No new tap-only gameplay mode was added in this pass.
- Racer: read the pause-access notice. Steering and native two-player controls retain their existing behavior. Live race steering is not a parking menu.

## Pass 4 — Companion

Reload the unpacked extension, then open Companion settings from the local Hub.

- There is one **Streaming and news** switch above a plain list of supported platforms and an explanation of Day Hub news. There are no per-service or News switches.
- Turn it On and approve browser access. The summary should say all streaming services and news are on. Turning it Off removes that access together; Calendar remains separate and keeps its saved connection.
- If an older installation has only some permissions, it shows **Incomplete**. Turn it Off to remove the remaining access, then On to enable the full group. Declining the browser request must not display On.

Open a fresh stream from the local Hub after enabling access.

- The video stays inside its frame. Buttons spread across one compact row, with playback and scan status inline at the far right; narrow windows scroll the buttons to reveal the selected control while keeping status visible.
- **Mute/Unmute** controls video audio, including when a video starts muted.
- In **Help → Toolbar Speech**, turn speech Off. The bar should stop reading its choices and status while Auto Scan keeps moving. This setting is saved for Companion only; changing Hub TTS should not change it, and changing it should not change Hub TTS or video audio. Turn it back On to hear the controls. The explicit **Say I need help** action still speaks when selected.
- Check blank, Parked, scan pause, Help/Back, fullscreen and Exit to Hub. In the Companion, scan pause uses only a dotted highlight on the selected button; it adds no Paused label or badge.
- Confirm playback with your actual provider. Automated checks use controlled provider fixtures; they cannot establish signed-in DRM playback or audible output from your installed voice.

If anything differs, record the app, exact menu, Auto/Parking/Brake/Wait values, and the key sequence. The implementation/coverage record is [SCAN-UPGRADE-CHANGES.md](SCAN-UPGRADE-CHANGES.md); automated evidence is summarized in [submission/VALIDATION.md](submission/VALIDATION.md).

The complete pre-upgrade website is preserved under the workspace’s Website Backups/NARBE-LLC-WEBSITE-before-scan-upgrade-20261003 folder. Later per-pass snapshots and previous Companion ZIPs are also retained. Electron remains untouched by this pass.
