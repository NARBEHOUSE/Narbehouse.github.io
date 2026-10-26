# NARBE Loops

One visual beat maker. Light up colored pips, hear the loop repeat, and return to the same loop next time. Start with Kick, Snare, Hi-hat, Bass and Melody; add up to eight sound lines. The current loop saves automatically. Save Loop also keeps optional templates you can reopen; there is no song arranger.

## Controls and scan order

[ACCESSIBILITY.md](../../../../ACCESSIBILITY.md) is the authority. Every screen is a CHOICE surface, including editing while music plays.

| Screen | Scan order |
| --- | --- |
| Main menu | Make a Loop, Saved Loops, How to Play, Settings, Exit Game |
| Make a Loop | Sound lines in order, Add a Line, Play/Stop, Speed, Options |
| Inside a line | Name tile, spots 1–16, shared Back stop |
| Row menu | Mute/Unmute, Change Sound, Next Pattern, Remove Line, Back |
| Change Sound | Four picture choices, Back |
| Add a Line | Kick, Snare, Hi-hat, Clap, Shaker, Rim, Open hat, Bell, Pluck, Bass, Melody, Back |
| Pause | Continue, Save Loop, Saved Loops, Settings, How to Play, Main Menu, Exit Game |
| Saved Loops | Numbered picture cards, Back |
| Settings | Speaking, Voice, Look, Highlight Style, Highlight Color, Auto Scan, Scan Speed, Sound, Volume, Clear My Loop, Back |
| How to Play | Read the title aloud, Back |

New screens and modals start on blank. Space steps on release; holding Space for three seconds scans backward at the hub interval. Enter chooses on release. The shared hub controller owns Auto Scan, parking, brake, speech waits and row Back; there are no local copies or extra debounce. Blur, cancellation and fresh screens clear half-held input.

Selecting a line enters its name tile first. Selecting a pip toggles it and keeps the highlight on that pip. Holding Enter for five seconds inside a line returns to that same line in row mode; its release does nothing. A progress bar and seconds countdown fill the existing transport status space during the hold and disappear on release, cancellation or return. Auto waits until release before resuming, and blur, cancellation or an ownership change cancels the hold. After spot 16, the shared dashed Back outline surrounds the line; selecting it restores that same line in the main scan. Rows wrap through Back in both directions. The play light never decides which spot gets edited.

Click or tap a pip to toggle it directly. Click or select a name tile to open the row menu over the visible loop. The background cannot take input while a modal is open, and scanning stays inside the modal. Its Back returns to that same name tile inside the line. Change Sound shows large picture choices, speaks each name and previews it on focus. The loop keeps playing through the row menu and sound picker. Selecting a sound applies it live to the entire line and keeps that choice highlighted, so sounds can be compared without reopening the picker. The picker’s Back returns to a blank row menu. Opening and closing these overlays never restarts playback, and an already stopped loop stays stopped. Individual pips only turn on or off.

Add a Line uses the same picture-and-preview controls. Added lines start empty, have their own name and menu, and save immediately. Added melodic instruments use the same A minor pentatonic scale and contours as Bass and Melody. At eight lines, Add a Line explains the limit and is skipped by scanning. Remove Line and Clear My Loop both require two selections; moving away, including to blank, disarms confirmation. Removing the last line is allowed; Add a Line stays available. Clear My Loop restores the original five-line starting loop.

The only global controls are in the separated transport bar: Play/Stop, Speed and Options. Options opens Pause. Exit Game returns to the hub with the existing focusBackButton message.

## Saved loop templates

Choose Options → Save Loop to keep a numbered copy (Loop 1, Loop 2, and so on). Saving retains the current selection and reports the saved name. Saved Loops is available from the main menu and Options. Its picture cards show the saved patterns; select or tap one to reopen it directly. Back returns to the menu it came from. The screen opens blank like the other choice screens.

Templates include ordered lines, sounds, patterns, mute states, speed and the playback preference. Editing or clearing the current loop leaves every template unchanged. Reopening a template makes it the current automatically remembered loop. A failed write does not replace a saved template or the current loop. No arranging, repeat counts or song controls are involved.

## Layout

Studio and Simple High Contrast use the same controls. Colored lines, instrument pictures, numbered pips, filled check marks and the separate moving play light make state visible without relying on color alone.

All targets are at least 64 by 64 pixels at 1024×768, 768×1024, 390×844 and 1024×500. Sixteen such targets cannot fit across the narrow windows, so ACCESSIBILITY.md takes precedence over a single physical strip: pips wrap within their sound line, in the same 1–16 scan order. At wide widths they form one strip. The page scrolls normally; there is no nested grid window. Scanning brings the selected pip above the transport bar.

## Storage and migration

- nl-settings-v1 retains the existing local appearance and sound settings. Shared access and speech settings still come from the hub managers.
- nl-loops-v1 stores version 1 template records, each with a stable ID, number and independent loop snapshot. This is separate from the untouched old nl-studio-v1 library.
- nl-beat-v1 stores the one current loop. Its version 2 payload contains speedIndex, playing, nextLine, an ordered list of line IDs, and layers keyed by ID. Each line has its instrument kind, name, preset/custom pattern, mute state and one scalar sound index.
- Every change saves automatically, including added/removed lines, whole-line sounds and the Play/Stop preference.
- Older five-line saves load directly. Old per-pip sounds become the most frequent sound across that row's sixteen entries; ties use the first sound in picker order. The converted row is saved with one sound index.
- If nl-beat-v1 is absent, ngb-beat-v1 supplies the old loop. The original key is never modified or removed. Later Loops saves take precedence.
- Existing saved beats and songs in nl-studio-v1 are neither read nor written. Their stored contents remain untouched; their screens and arrangement code have been removed.

## Audio

The loop is synthesized into a two-bar, in-memory WAV. Its audio buffer contains 32 contiguous copies, so musical repeats do not seek or restart the media element. Before the long buffer ends, the next element is prepared at the matching musical phase. The old element continues until the replacement's play promise resolves. Pattern and speed changes retain this swap behavior.

One-off feedback and picker previews use SafeAudio. Speech ducks playback. There is no Web Audio context and no whole-song rendering. The catalog image remains ../../../images/games/narbeloops.png; its generation prompt is in [generation-prompts.json](generation-prompts.json).

## Checks — 2026-10-25

All GUI checks below are muted and use absolute, disposable OS-temp working directories and profiles. They run NARBE Loops only.

- node --test tests/narbeloops-pattern.test.cjs tests/narbeloops-lines.test.cjs tests/choice-scan-adapter.test.cjs — 28 passing tests covering independent pips, visible-pattern edits, melodic contours, added/removed lines, whole-line sounds, old-save migration, untouched libraries, template save/reopen independence and failed-write recovery, PCM continuity and the shared scan contract.
- node tests/narbeloops-browser.cjs — real Chrome key, mouse and touch events; blank roots, name-first row scans, held-Enter Back in manual/Auto modes and cancellation, Back in both directions, foreground modal return identity, live sound swaps, previews, confirmation disarming, eight-line limit, persistence, Auto/brake/parking/cancellation and all nine screens in both looks at the four required sizes. Also checks the second/third audio repeats and forced long-buffer refill, zero AudioContexts, no console errors and no missing local files.
- node tools/run-electron-test.cjs tests/music-games-electron.cjs --loops-only — production preload and native settings; key-release editing, held-Enter and shared Back, live overlays, phase-preserving loop replacement, settings identity, row menus, live sound selection, added lines, template save/reopen and reload.

The previous node tests/music-games-browser.cjs --loops-only entry point forwards to the dedicated Loops suite. Reports and visual captures are in tmp/narbeloops-check/ and tmp/music-games-electron-check/.

Automated browser and Electron checks pass. These checks do not replace a listening test on the player's audio device, physical-switch testing, or iPad/Safari and packaged-Hub testing. Before release, use one switch through Main Menu → Make a Loop → name → Change Sound → Back → pips → shared Back → Add a Line → Options → Settings → Exit; repeat with two switches and mouse/touch. Listen through several repeats, edits and speed changes, and check speech ducking and app switching with a switch held.
