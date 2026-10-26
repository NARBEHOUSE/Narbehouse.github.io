# NARBE Switch Songs

A piano songbook played one note at a time with a switch. Six collections hold
41 familiar melody phrases. Each song has its own static illustrated scene,
piano-key feedback and a shuffled completion celebration on the results screen.
No score, timer or losing. The player supplies the rhythm. Free Play offers an
individual-key piano for making their own music.

## Play and access

Main menu: Play Songs, Free Play, How to Play, Settings, Exit Game. Choose a collection and
song. Another Song returns to that same collection. All new screens start on the
blank park step; Enter does nothing there in manual scanning.

Song scanning is **blank → Play Each Note → Keyboard → Listen to Song → Options**.
Choose **Play Each Note** to highlight the whole keyboard without sounding a note.
Then each Enter press plays the next note; its release never chooses anything.
Each press holds the Auto clock. Holding Enter for five seconds pauses from
anywhere, including parked, with a filling bar and beeps. Its release is consumed,
as is the final note's release across the completion screen. Options provides a
pause route without a hold. Tapping the scene or any piano key plays one note;
Options is separate. Menus use release actions and shared scanning, with no
additional debounce. Blur, input cancellation and screen changes clear holds.

**Listen to Song** plays the entire selected melody once, without advancing the
player's saved note position or triggering a completion celebration. The same
button becomes **Stop Listening**. The piano keys and progress line follow the
audio element's playback time; repeated notes lift between presses. Stopping,
playing a note, opening Options, changing screens or leaving the app ends the
performance and restores the player's progress. This includes all notes of the
game's existing short melody arrangement, not a full concert recording.

The song piano has 24 keys, C4–B5. Entire phrases are transposed while preserving their
intervals. Long repeated passages are shortened at phrase boundaries; phrases
contain 17–47 notes. A played key moves down, glows and changes color for 400ms.
Show Next Key defaults On; Key Labels defaults Off. Songs use piano only. The
song illustration fills the entire viewport, like Switch Stories. The title,
keyboard, progress and three action buttons overlay the picture. Directions
sit at the top right beside the song title. At the bottom, the progress line
comes first, then the centered keyboard, then the action buttons. The keyboard
is capped at 980px wide and shrinks with the
window. Its proportions keep the keys slender, and translucent key fills let
the scene show through. Played keys and scan highlights remain strong. Solid
panels keep the text and action buttons readable in both looks. All 24 keys
scale together without horizontal scrolling; the keyboard is one target, with
no aiming requirement. The picture keeps its proportions and crops to fill
the screen, with song-specific portrait framing for the main subjects. Artwork
extends into mobile safe areas while the controls stay clear of them.
Choosing Play Each Note while listening stops playback and preserves your place.

**Free Play** opens on blank, followed by the whole keyboard, Replay My Song,
Delete Note and Options. Select the keyboard on Enter release to scan the 25
individual keys from C4 to C6 in pitch order, starting on Low C without sounding
or recording it. After the last key, the whole keyboard is highlighted again;
select it to restart the keys, or scan forward to the buttons. After Options
and the recurring blank, the scan returns to the whole keyboard. Auto Scan
follows the same route and only enters individual keys after selection, with
a full scan interval on Low C. Reverse scanning out of the keys also closes
the individual-key pass. This remains one root choice loop, so no extra Back
selection is needed to reach Replay, Delete or Options. Mouse and touch can
still play any visible key directly. Replay and Delete Note are disabled
and skipped until a note has been played. Every key, including the black keys, is a separate
CHOICE: Enter plays on release; mouse/touch plays the chosen key. Repeated
selections repeat that note. Key labels stay visible. The two-octave piano spans
the available width, with 15 white keys and ten black keys. Piano key length is
reduced by 30% from the previous full-height layout, giving that space to the
note-history area above. The musical symbol and current key name are centered
together above the saved notes; partial rows of saved notes are centered too.
All keys, saved notes and action
buttons fit without horizontal or vertical scrolling, including during deletion.
Portrait screens up to 900px wide show two complete octave rows; larger and
landscape screens use one continuous row. The low-to-high scan order is unchanged.
Key widths scale with the viewport to meet the user's all-visible requirement,
instead of enforcing the former 64px minimum and scrolling. Main action buttons
stay at least 64px high. Octave labels distinguish matching pitches in the saved history;
existing C4–C5 saves still load, and the added pitches save and replay normally.
Song Pause is ordered Continue, Restart Song, Another Song, I Need Help,
Settings, Main Menu and Exit Game. The song image stays behind the pause card,
and its name appears under Paused. Free Play omits Restart Song and Another
Song. How to Play is available from the main menu only. Ready indicators have
been removed; the shared Parked badge still appears during deliberate Auto parking.
Selecting it says "I need help, please!" twice and leaves the game paused.
It uses the Hub communication speaker when enabled, otherwise the shared voice
manager with Speaking overridden for this deliberate request. Auto narration
does not interrupt the fallback help message; switches and touch remain usable.
Holding Enter (or NumpadEnter) for five seconds also opens Pause from anywhere
in Free Play, including blank/parked, replay and note deletion. The Options
button shows hold progress with the same countdown sounds as song mode.
A shorter press still selects on release. A completed pause hold never plays
or deletes a note, and its release cannot choose a Pause item. Blur, hiding
the page, input cancellation and screen changes clear an unfinished hold.
Continue opens on blank. The current note's name and a consistent note symbol
appear above a numbered history of the last ten keys actually played, from left
to right. Repeated notes, sharps, Low C and High C remain distinct. The history
is saved in `nss-freeplay-v1` and survives Options, menu visits and reloads.
Replay plays these notes once at 100 BPM, omitting the delays spent scanning.
Its button becomes Stop Replay, and the keys and history follow the audio clock.
Playback does not add notes to the history. Playing a new key, Options, blur,
input cancellation, hiding the page or leaving the screen stops replay.
Delete Note stops replay and enters the saved notes in their original order.
Select a particular occurrence to remove it on release, then return to Delete
Note. The shared dashed Back stop follows the last note and loops in either
direction; selecting Back cancels without deleting. The group starts on its
first note, while separate screens still start on blank. Note identities and
original numbers survive deletion, including when pitches repeat. Existing
saves migrate automatically. Deleting the final note disables both buttons
and returns to blank; mouse/touch can select notes directly in the editor.
Simple High Contrast keeps the history and uses a white symbol on black;
Reduced Motion keeps the feedback still. Blur, input
cancellation and screen changes clear pressed keys and animation timers.
Phone layouts place the current note beside its symbol and use a compact
history above the keys. Sideways phones use a shorter history strip. Note-deletion
targets remain at least 64px on tablet/desktop layouts, or 44px in compact phone
layouts. The piano and note editor adapt to the available screen height.
Rotation preserves the selected key or note, Auto brake state and saved music.
The game frame respects notch/home-indicator safe areas. Touch swipes neither
move the Free Play piano nor add notes.

Menus, song selection and Free Play are CHOICE. Sounding the next song note is a press-driven
mechanic within the Play/Listen/Options scan. Audio and visual feedback never select
choices. Exit Game sends `focusBackButton`, or navigates to the hub when standalone.

## Appearance, audio and files

- Both looks show each song's static scene and the song/collection thumbnails.
  Simple High Contrast pairs the artwork with black-and-white controls and a
  black piano band. Note feedback stays on the keys; no overlays obscure the
  picture. Reduced Motion disables animated celebrations.
- The main menu fills the available screen with large text and controls. Its
  playful piano spans the width above separate Play Songs and Free Play buttons.
  The same cream, teal, yellow and coral palette and rounded controls continue
  through collections, song lists, song playback, Free Play, results, Settings,
  How to Play and Pause. The menu piano sits higher and retains its full width
  and proportions; short windows scroll the whole menu within its growing card.
  Simple High Contrast also shows this piano above its dark controls. The illustration is
  `images/menu/piano-playful.webp` (1920×640, 69,878 bytes), displayed without
  cropping. Song and collection cards show the complete picture above the label.
- Landscape uses 41 painted scene extensions in `images/scenes-wide/`; portrait
  keeps the original compositions. The song layout reserves space for the piano
  and controls, then fits the complete scene into the remaining area. Taller
  pictures such as London Bridge no longer push Options off-screen. Images keep
  their proportions and full composition. These WebPs are 1920px wide, totaling
  10,316,816 bytes.
- Pause and completion panels have slightly transparent backgrounds in both looks,
  with solid text and buttons. Completion celebrations fill the current song
  picture outside the results card; the card's area is excluded from the effects,
  including after resizing or scrolling, so only the static picture shows through.
  Leaving results clears the particles; Reduced Motion uses the static badge.
- `nss-settings-v1` stores local settings. Speech, voice, Auto and speed remain
  owned by the shared managers; other global scan options stay in Hub Settings.
- Piano notes are synthesized as 1.5-second WAVs with a hammer transient and
  decaying harmonics. All 24 notes prewarm in small slices. SafeAudio plays them.
  Speech ducks playback. Backing Beat has been removed from Switch Songs;
  an older saved preference cannot enable it.
- Listening renders each song's piano arrangement into one non-looping WAV.
  The current song alone is cached; no audio context or JavaScript note timer
  is used. Beat lengths and tempos are in `js/song-library.js`.
- `js/song-library.js`: collections and melody phrases; `js/scenes.js`: backgrounds;
  `js/celebration.js`: completion effects; `js/synth.js`: WAV synthesis.
- `js/freeplay.js` and `css/freeplay.css`: individually scanned keys and native
  SVG music feedback and ordered note history. `css/menu.css`: the full-screen
  main menu. `css/playful.css`: the shared playful look across every screen.
- `images/scenes/`: 41 unique illustrations. `images/collections/`: six tiles.
  Each is 1280×800 WebP, under 150,000 bytes; together 6,387,964 bytes.
- The catalog tile is `../../../images/games/narbeswitchsongs.png`, 1280×720 PNG.
  All illustration prompts and the tile prompt are preserved in
  [generation-prompts.json](images/generation-prompts.json). Artwork used the
  built-in imagegen tool; browser canvas encoding supplied the requested sizes.

## Accessibility shipping review — 2026-10-25

[ACCESSIBILITY.md](../../../../ACCESSIBILITY.md) is the authority in this checkout.
Shared scripts preserve SafeAudio ordering, followed by electron-bridge,
platform, badge, choice controller/adapter and managers before game modules.
The local `shared/electron-bridge.js` exists and is referenced by both games.

| Section 10 item | Evidence / remaining work |
| --- | --- |
| State classification and blank roots | Real Chrome key tests cover collection/song menus, all 25 Free Play keys, Replay and Options, Play Each Note/Keyboard/Listen/Options, results and pause. Enter is inert on blank; reverse scanning visits blank. |
| Auto, parking and native hold | Shared tests cover 1/2/3-loop parking and resume without activation. Native five-second pause remains independent of the selected choice. |
| Brake, speech wait and identity | Shared controller tests cover Brake Off/On, owned speech success/error/cancel/timeout, stale events and stable IDs. The browser suite checks shared Auto/settings behavior. |
| Back and screen returns | All six collections scan in order. Back and Another Song return correctly. Separate menus reopen on blank. |
| Releases and lifecycle | Chrome verifies Free Play notes only on release/click, song notes on press, swallowed final-note/pause releases, blur, keyed/unscoped cancellation and screen ownership changes. |
| Global settings and preserved behavior | No local parking/brake/sensitivity/wait controls; existing song press/hold and randomized celebrations retained. No destructive song action. |
| Exit and layout | Both hub and direct exits pass. Both looks, all nine screens, four specified viewport sizes; targets ≥64px high and final choices scroll into view. Main menu and Free Play also fit six tablet sizes in both looks. |
| Actual coverage | Every note of all 41 songs updates the correct piano key while the artwork stays static. All images decode. No game console errors, missing local assets or constructed AudioContexts. Both new pages load through VS Code Live Preview. |
| Electron renderer | Eleven checks pass with the production preload and isolated native settings. Native key events verify all 25 Free Play pitches on release, piano audio, listening keys/progress, restoration after Stop, static artwork, final-note release consumption, song pause while parked, Free Play hold-to-pause and I Need Help with Speaking off. No game script errors, missing local assets or constructed AudioContexts. |
| Human/device release check | **Outstanding:** listening to all melodies by ear, a real switch user's full path, iPad/Safari and the packaged Electron Hub. Automated pitch checks do not establish musical recognition or gapless playback. |

Combined validation: 23 browser behavior checks and 120 screen/look/viewport
combinations. The existing 69 model/shared-controller checks are joined by three
listening checks (complete WAV rendering for all 41 songs, cancellation/races,
and rejected playback). Tablet artwork checks cover all 41 scenes across nine
sizes, including 1024×768, 1180×820 and 1366×1024 and their portrait counterparts.
Screenshots and framing results are in `tmp/switchsongs-tablet-review/`.
Main menu and Free Play tablet previews are in `tmp/switchsongs-playful-menu-review/`.
Updated theme, menu containment and note-history previews are in
`tmp/switchsongs-theme-review/`, covering ten tablet, desktop and small-window
sizes in both looks.
High Contrast artwork checks cover all 41 songs at eight sizes, including six
tablet orientations; previews are in `tmp/switchsongs-contrast-art-review/`.
The song-fit regression checks all 41 songs at 13 sizes in both looks (1,066
layouts), including wide desktop and short preview windows. It now verifies
full-viewport artwork and visible overlaid piano/actions without scrolling. Current
Free Play, menu and background-celebration previews are in
`tmp/switchsongs-additions-review/`.
Whole-keyboard and Delete Note previews are in
`tmp/switchsongs-freeplay-edit-review/`, covering both looks at six tablet
orientations, a desktop size and a narrow phone size. Chrome and Electron
verify the restart stop, individual deletion on release, saved-note identities
and updated replay. Chrome also checks Back in both directions, cancelled
presses, Auto Scan, migration, mouse deletion and deleting the final note.
The responsive audit covers 340 screen/look/viewport combinations at 17 sizes,
from 320x568 phones through 2560x1440 monitors, including landscape phones,
short browser viewports and tablet orientations. It also checks all 41 songs
at every size in both looks (1,394 song layouts), full-screen images, visible song
controls, main action target sizes, actual viewport scale, and every root scan target.
Screenshots and results are in `tmp/switchsongs-responsive-review/`.
The focused `--free-only` audit checks Free Play and Delete Note in both looks
at 20 sizes, including 960x540, 1280x720 and 1440x900. All 25 keys must already
be on screen, and scanning must leave both scroll offsets at zero.
Nine mobile behavior checks exercise real Chrome touch events, keyboard swipes,
individual note deletion, rotation with selected keys/notes and the Auto brake,
emulated safe-area insets, listening/stop across rotation, and Free Play's
five-second pause hold from keys, blank/parked, replay and note deletion.
The pause checks cover shorter holds, swallowed releases and lifecycle cleanup.
They also scan the exact song and Free Play pause orders, check the song image
and name through Settings/Continue, verify Restart Song/Another Song, and
confirm the Ready indicator is absent while deliberate parking still shows Parked.
Completion checks keep the matching picture in both looks, put celebrations
behind the stationary results card, clear effects on restart, and retain the
artwork with Reduced Motion. Pause and results backgrounds fill all 17 viewports.
The Play Each Note check covers release-only keyboard activation, subsequent
press-to-play, returning from Listen without advancing, manual/Auto/reverse
scanning, rotation, and cancelled presses. The layout audit also verifies the
keyboard and buttons stay over the image and fit every song viewport without
scrolling. Mobile checks also confirm the artwork fills the screen beyond the
notch/home-indicator safe areas while the controls stay inside them.
The help-call check covers both pause menus, activation on release/touch,
Speaking Off, Auto narration, communication-speaker routing and preserved
progress. Speech output is captured at the engine boundary during automation;
the actual voice and speaker still need a human listening check.
Results are in
`tmp/switchsongs-mobile-check/`. These are browser emulations, not physical
iPad/iPhone or Safari tests.
Browser artifacts are under `tmp/music-games-check/`; Electron results are in
`tmp/music-games-electron-check/report.json`. Run from the repository root:

```text
node tests/music-games-browser.cjs
node tests/music-games-browser.cjs --songs-only
node tools/run-electron-test.cjs tests/music-games-electron.cjs
node tests/switchsongs-responsive.cjs
node tests/switchsongs-responsive.cjs --free-only
node tests/switchsongs-mobile.cjs
node --test tests/switchsongs-listen.test.cjs
node --test tests/narbeloops-pattern.test.cjs tests/switchsongs-songs.test.cjs tests/scan-upgrade.test.cjs tests/choice-scan-adapter.test.cjs tests/scan-status-badge.test.cjs
```

Both GUI runners use an absolute disposable OS-temp cwd/profile and clean it
after closing the app. The Electron fixture disables speech; it does not test
the packaged Hub or native speech. Unrelated existing hub requests (`nav_signal.json`, favicon
and the Dice tile filename casing) may still return 404; neither new game does.

## Test by hand before release

1. Use a real switch for Hub → collection → song → Play Each Note → Options → Settings → Continue
   → song finish → Another Song → Exit. Try both Auto and manual scanning.
   Choosing Play Each Note must highlight the keyboard without playing. The
   next Enter press plays exactly one note; its release must not play another.
2. Listen to all 41 short melodies by ear, especially the shortened phrases.
   Verify one note per press, the piano sound and each song's static picture.
   Use Listen to Song; check keys and the line follow the audio, Stop works,
   playback ends once, and the original note position returns afterward.
3. Hold the last note across the celebration, and hold Enter to pause from blank
   and parked. Release must not select anything on the new menu.
4. Check both looks, Reduced Motion, next-key hints, labels and speech.
   On iPad/Safari, check piano playback and Listen/Stop. Repeat in Electron.
5. Rotate a real tablet during a song. Check the main subjects in both orientations,
   menu readability, and access to Play Each Note, Listen to Song and Options. Repeat on a phone
   with browser controls visible; check notch/home-indicator spacing. Rotate
   while a Free Play key or saved note is selected and while replay is running.
   The same choice must remain visible without playing or deleting a note.
6. Enter Free Play with a real switch. Select the whole keyboard first; Low C
   should highlight without playing. Try all white and black keys, repeated
   notes, reverse scanning, Auto Scan, parking and Options. Check that a note
   sounds once on release, all keys stay visible, and the numbered history shows
   the last ten chosen notes in order, including repetitions and sharps. Replay
   them, stop midway, add another note and reload. Check the save and playback
   order, and confirm that replay does not record extra notes.
   After High C, check the whole-keyboard highlight: Enter returns to Low C
   without playing, while the next scan reaches Replay My Song. After Options
   and the blank step, the whole keyboard should highlight again. In Auto Scan,
   let two cycles pass without selecting: no individual key should highlight
   or play. Select the keyboard and check that Low C gets a full scan interval.
   Choose Delete
   Note, remove one of two repeated notes, and check replay and the saved order.
   Try the Back stop without deleting, and check the note targets on a real
   tablet in both looks and orientations.
   Hold Enter to open Pause from a key, replay and Delete Note, then Continue.
   No note should be added or deleted by the hold or its release.
   In each pause menu, select I Need Help with Speaking both on and off.
   Confirm the request is audible on the intended speaker and Pause stays open.
7. Finish a song in each look. Check that celebrations fill the background while
   the results card stays still and clear, and that its buttons work immediately.

## Inherited melody references

These references were recorded by the original melody library; they have not
been re-audited as part of this split.

Pitch references consulted for the expanded library include John Chambers'
[Funiculì, Funiculà transcription](https://www.folktunefinder.com/tunes/6575),
[William Tell theme](https://abcnotation.com/tunePage?a=trillian.mit.edu%2F~jc%2Fmusic%2Fabc%2Fmirror%2FLesterBailey%2Fmelnets_big_abc_file%2F15528)
and [Stars and Stripes trio](https://abcnotation.com/tunePage?a=trillian.mit.edu%2F~jc%2Fmusic%2Fabc%2Fband%2FStars_and_Stripes-Eb%2F0000),
plus [The Entertainer's melody](https://ivorypiano.com/songs/the-entertainer)
and [Toreador's melody](https://pianumero.com/song/toreador).
Additional phrase checks used [Farmer in the Dell](https://www.singing-bell.com/wp-content/uploads/2022/04/The-farmer-in-the-dell_Glockenspiel_Chroma_Singing-Bell.pdf),
[Little Dog Gone](https://www.zebrakeys.com/blog/where-has-my-little-dog-gone/),
[Up on the Housetop](https://tonalics.com/play/accordion/songs/up-on-the-housetop)
and [Brahms' Lullaby](https://onlinepianokeyboard.com/songs/brahms-lullaby).
Only melody pitches are represented, with transposition where useful for the
piano's range; rhythm remains entirely under the player's control.
