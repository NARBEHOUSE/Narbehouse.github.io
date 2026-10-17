# Sphere Splash audio

Every file in `sfx/`, `crowd/` and `music/` is an original sound synthesised for Benny's Sphere
Splash. There are no recordings, samples, speech or existing music in any of them, and no
downloads or outside services were used.

The whole source is `../tools/generate-audio.mjs`. Run it from the game folder to rebuild
every file and `js/audio-files.generated.js`:

```sh
node tools/generate-audio.mjs
node tools/check-audio.cjs
```

All files are 16-bit PCM WAV, 22,050 Hz, stereo, about 6.5 MB in all. Each recipe starts from
the random seed it had when Bryan picked it in a listening round, so the files come out
byte-for-byte the same every time. If you change a recipe, listen to it again.

- `crowd/bed.wav`: a 10-second murmur loop, heard as if from inside the water sphere.
- `crowd/swell.wav`: a sung "ooh" that rises as a shot goes in. Made from hummed voices only, so it has no hiss.
- `crowd/roar.wav`: the goal roar, with applause.
- `crowd/groan.wav`: a sung, falling "aww" for a save or a blocked shot.
- `sfx/`: the underwater set (whistle, pass, catch, shot, tackle, block, save, goal, tech, decision, menu move and select) and `tick1`–`tick5`, the rising ticks of the pause hold.
- `music/theme.wav`: the island theme, a 33.1 s loop followed by a copy of its first 3 s, which the gapless player in `js/audio.js` needs.
- `music/goal.wav`, `win.wav`, `lose.wav`: the anthem stings.

`vo/` is the voice slot for recorded commentary (see DESIGN.md, Broadcast). Its clips come from a separate pipeline.
