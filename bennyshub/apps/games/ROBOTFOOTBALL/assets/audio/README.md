# Football audio

All 26 WAV files in this folder are original procedural sounds created for
ROBOTFOOTBALL. They contain no third-party recordings, samples, speech,
or existing music. No asset downloads or external services are required.

The complete reproducible source is `../../tools/generate-audio.mjs`.
From the game directory, regenerate with:

```sh
node tools/generate-audio.mjs
```

All files use standard 22,050 Hz, 16-bit PCM WAV. The package is 2,709,552 bytes.
The two crowd loops are stereo, with an offline crossfade across each loop
boundary. Crowd-swell, touchdown, win, and lose are also stereo.

- `crowd-bed.wav`: ten-second stadium murmur, voice-like noise resonators,
  low-frequency air, and sparse distant applause.
- `crowd-detail.wav`: six-second independently breathing crowd layer.
- `crowd-swell.wav`: short crowd response for catches, tackles, and scores.
- `snap.wav`, `catch.wav`, `tackle.wav`, `kick.wav`: layered leather/body
  transients with low impacts, cloth, and turf noise.
- `throw.wav`: short passing whoosh.
- `whistle.wav`: a short, soft referee tweet, lower and gentler than a real whistle because it plays after every play.
- `touchdown.wav`, `win.wav`, `lose.wav`: brief original brass-like stingers.
- `hover.wav`, `select.wav`: soft interface feedback.
- `pause1.wav` through `pause4.wav`: clearly ascending pause-hold tones.
- `clang.wav`: metallic armour impact layered under every tackle.
- `break.wav`: electric servo zap when a runner breaks a tackle.
- `powerup.wav`, `powerdown.wav`: rising and falling robot chimes for
  successful and failed extra points, conversions and kicks.
- `charge.wav`, `ready.wav`: the charge meter's rising hum and its clear
  two-note "full" tone.
- `target.wav`: the kick guide's soft ping when the aim is between the uprights.
- `over.wav`: two short low pulses when a charged throw runs past the receiver.

`../../js/audio.js` preloads file-backed effects through the hub's SafeAudio
pool. The two crowd loops use managed HTMLAudio elements. Playback does not
create an audio context. Crowd volume drops while browser speech is active.
Pause, blur, and hidden-page events stop the ambience. Master sound and crowd
settings are independent, and all listeners and timers are removed on dispose.

Public interface: `window.FootballAudio` exposes `init()`, `unlock()`,
`setEnabled(boolean)`, `setCrowd(boolean)`, `play(type)`, `pause()`,
`resume()`, and `dispose()`. Settings persistence belongs to the game UI.

Validation: checked PCM headers, sample ranges (no clipped samples), source
paths, and playback lifecycle through a mocked HTMLAudio/SafeAudio harness.
