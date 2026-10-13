# Benny's Battle Boats

An accessible Battleship game for one player against the computer or two players sharing a screen.

## Playing
- Place five ships (2, 3, 3, 4, and 5 squares) on the 10×10 board. The fleet starts randomized; choose a ship to move or rotate it, or launch immediately.
- Scan a row, then a square, to fire. Hits have an amber × and damage effect; misses have a pale ring. Sink an enemy ship to reveal its full hull.
- The defense scene shows your fleet and the incoming shot.
- The result screen reveals the opponent's remaining ships, shows shots, accuracy and ships sunk, and waits for Play Again or Main Menu.
- Two-player placement uses a privacy handoff screen. During battle, each player sees only their own attack history and the opponent's sunk ships.

## Controls and accessibility
- Space release: next choice. Enter release: select.
- Auto Scan in Settings enables Enter-only play using the Hub's shared scan speed, parking, brake and speech-wait preferences.
- Rows use the shared nested Back stop. Pause is a choice in the attack row scan and placement controls.
- Existing held Space reverse scanning and held Enter navigation/pause remain available. Escape also opens Pause from the attack row scan.
- Mouse and touch work alongside switches.
- Sound effects can be muted (including scan tones), with Low / Medium / High volume.
- Motion can follow the system preference or be explicitly Full / Reduced. Reduced motion keeps all damage markers, ship reveals, text and spoken outcomes.
- Speech uses the shared Hub voice settings. Automatic attack/defense/result transitions wait for the outcome's speech completion, then at least 650 ms of breathing room. Visual minimum durations still apply. The enemy-turn announcement finishes before the incoming shot.
- Pausing freezes the turn sequence, including speech waits. Returning to the menu cancels pending shots and transitions. Failed speech has a bounded fallback so play cannot become stuck.

## Presentation
The native HTML controls and shared scan adapter are retained. SVG ships and CSS effects provide ship details, water movement, shot tracers, splashes, explosions and hull reveals without a game-engine dependency. Unrevealed enemy ship coordinates are never added to the decorative hull layer.

Audio uses the Hub's HTML5 `SafeAudio` path, with five original procedural WAV effects. Regenerate them with:

```text
node scripts/generate-battleboats-audio.cjs
```

Run that command from the Hub repository root.

## Run and verify
Open `index.html` in the Hub or a browser.

From the Hub root, run:

```text
node scripts/check-battleboats.cjs
```

The regression fixture uses a headless browser and an isolated profile. It checks switch navigation, privacy, shot resolution, pause/cancellation, both player modes, results/replay, reduced motion, audio decoding, small layouts, and delayed speech tickets. Reports and screenshots are saved under `artifacts/battleboats/`. It does not change the user's Hub profile.
