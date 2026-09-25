# Local audio production

The game currently uses shared TTS for accessible navigation and locally synthesized sound/music files through SafeAudio. No external generation service is called during play.

The siege sound pack is original procedural audio generated offline with `node tests/generate-siege-audio.cjs`: 52 WAV files in `audio/generated/siege/`. Wood, stone, glass and metal each have three variations and left/center/right stereo versions, with separate launch, fire, split, Boulder landing, creaking, rubble, explosion and musical reward cues. `js/audio-safe.js` uses shared SafeAudio with rate limits and quieter destruction cues during TTS/aim guidance. Music and sound effects retain separate toggles. No AudioContext is created by the game. Re-running the generator deterministically recreates the pack; the existing music and pickup/aim cues are retained.

For higher-quality prerecorded assets, audition [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) for music and [Chatterbox](https://github.com/resemble-ai/chatterbox) for character speech. These are dedicated audio models; a general local chat model can help write prompts and dialogue but does not itself produce audio waveforms. These recommendations have not been installed or benchmarked on this PC.

Generate offline, select the best takes, and ship ordinary audio files. This avoids per-play generation charges and keeps the switch interface responsive. Keep the live TTS fallback for variable menu labels and saved castle names. GPU requirements depend on the model variant; check the linked official setup instructions before downloading weights.

Suggested music direction: instrumental, cheerful medieval courtyard, plucked lute and recorder, light hand drum, gentle 90 BPM pulse, no vocals, no sudden loud accents, space for spoken instructions. Edit to a clean loop and match loudness across tracks.

Keep navigation speech factual: “Paused”, “Shot fired”, “Level complete”, and “Restart castle”. Narrative TTS belongs on the kingdom story card and completion ending, rather than random spoken quips during play.

Use original or consented character voices. Character chatter should stay optional and yield to navigation speech.

Boulder contact uses a single 2.4-second noise-based thud and fading rumble (`boulder-land.wav`), rather than retriggering a rolling cue. Its launch has no pitched sweep.
