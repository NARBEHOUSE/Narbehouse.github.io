# Walt's lines still to record

Voice: **Matthew Schmitz** - the warm mountain man Walt already speaks in.

0 lines. Each one is saved into `audio/vo/` under the filename given,
as an mp3. The filename IS the wiring: the game looks a line up by its
cue id, so `q09_send.mp3` is what makes q09_send play instead of the
system voice reading it out.

When the files are in, add them to `audio/vo/index.json` under `lines`
(`"q09_send": "q09_send.mp3"`), or just run `python tools/record_voice.py`
which writes the manifest itself. `node tools/voicecheck.js` confirms it.
