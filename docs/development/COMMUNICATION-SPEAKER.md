# Communication speaker mode

Speaker Mode defaults off. Hub Settings has a separate **Speakers** section between
general settings and Scan. Graphics Quality remains in general settings. Speaker,
Speaker voice, Find speakers and Test speaker stay visible but disabled when off;
the existing choice scanner skips disabled buttons. When on, every control is in
the same Spacebar/Return and Auto Scan paths, with stable IDs and ordinary parking,
brake and speech-wait behavior. No additional input debounce or input lock was added.

Normal setup is: enable, select an output, select a voice. Cycling the output or
voice immediately requests a short sample through the selected speaker. Test speaker
repeats that sample (or stops current playback). Native scanning still identifies the
choice on the default output. Samples use the same cached text as voice warm-up;
quick changes discard obsolete preparation and playback rather than queueing previews.
Leaving Settings cancels its sample, and disabled mode never auditions.

There are 14 voices: Michael, Heart, Emma, George, Bella, Nicole, Kore, Sarah, Nova,
Aoede, Fenrir, Puck, Isabella and Fable. The added voices share the same Kokoro model;
individual voice files download/cache on demand without a separate installation.
The local voice downloads and warms in the background when enabled. Find speakers refreshes already
exposed outputs. If browser permission is needed, a spoken Cancel-first dialog
guards the native prompt and explains that caregiver help may be required once.
Chromium may require temporary microphone permission to expose named outputs;
all returned tracks are stopped immediately, and nothing is recorded.

## Routing contract

- `communication-speech.js` supplies `NarbeCommunicationSpeech.speak(text, fallback)`.
  Off invokes the app's original speech path. On is independent of general TTS and
  returns an owned `{started, finished, cancel}` ticket with actual playback completion.
- A same-origin Hub and its iframe apps share one worker, model and audio player.
  Standalone pages create their own service. Settings use `NarbePlatform.settings`
  under `narbe-communication-speaker`; they are browser/device-local and excluded
  from the existing account/backup allowlists.
- General TTS controls scan labels/system narration, not communication playback.
  Speaker Mode works with general TTS off; changing general TTS does not cancel an
  active public message. Off preserves each app's original TTS behavior.
- Deliberate public actions: Keyboard text box; Phrase Board tiles with the text
  box closed; Phrase Board message Speak; RTC Lite choices and typed-message Speak.
  RTC Lite's explicit keyboard-entry announcement is also public communication.
  All 19 existing caregiver Help actions across 17 games also route publicly,
  including Pet Pals' repeated request. Help focus labels and game instructions
  remain ordinary native feedback.
  Phrase Board's immediate tiles compose when the text box and Speaker Mode are on;
  off retains legacy immediate-tile behavior. Scan labels and other feedback remain native.
- Native Windows/Chrome voices remain available in normal mode. Browser native
  speech has no per-utterance output selection or audio-export API, so separate
  speaker playback uses local Kokoro voices. No Windows helper is installed.
- Output must be a concrete device, never `default` or `communications`. Errors and
  disconnects keep the text and display failure; there is no native/default fallback
  and no automatic replay. New messages replace old ones; output/voice changes,
  disabling, app exit and hidden pages stop owned audio. Blobs and observers are released.
- RTC Lite pauses listening through the whole public-speech ticket, independently
  of the native scanner's bounded completion tickets. Input stays usable.

## Companion Help

The updated Companion sends **Say I need help** back to the original Hub tab. That
Hub plays the fixed message using its selected speaker and voice, including when
general TTS and Companion Toolbar Speech are both off. The provider page never
receives speaker device IDs, arbitrary-text synthesis or Hub settings. Normal
controls retain their existing independent Toolbar Speech preference.

Only managed top-frame players may request Help, on the same original Hub URL.
The player stays focused; input remains available while waiting for real completion.
New requests replace old ones. Leaving Help, returning, page exit and closing the
player cancel pending speech. A 45-second deadline prevents stale playback if the
bridge stalls. Failure or a missing Hub reports an error without default fallback.
With a responding Hub and Speaker Mode off, native Help still works with Toolbar
Speech off. Keep the originating Hub open. Reload the updated Companion, refresh
the Hub and launch a new stream; existing windows may have older content scripts.
No new browser permissions or installed voice helper were added.

## Local voice and Bluetooth behavior

Kokoro 1.2.1 runs in a dedicated worker. A usable hardware WebGPU adapter selects
fp32; other browsers use q8 WASM. The first setup downloads the model (roughly
330 MB for fp32 or 90 MB for q8, plus runtime/voice files). Unsupported sink-selection
browsers explain the limitation and preserve normal speech.

Short chunks prevent silent tokenizer truncation. Complete audio is assembled
before playback. A bounded in-memory cache retains up to 32 messages / 16 MiB;
message text/audio are not persisted by this feature. Turning mode off terminates
the worker and releases its model and message cache. Each playback prepends exactly
750 ms of silent PCM, preserving all original speech samples. This is the Bluetooth
fix verified in the earlier Windows test, not a delay before opening the audio stream.

Service worker v50 caches the small routing scripts with the shell. The bundled
speech runtime is cached only when used; model/voice caching belongs to Kokoro.
Browser cache eviction, offline first setup and slower hardware remain limitations.

## Verification and handoff

- `node --test tests/communication-help.test.cjs`: fixed-text bridge, origin checks,
  cancellation, wrong/missing Hub, and no default fallback.
- `node scripts/check-companion-toolbar-speech.cjs`: actual unpacked extension and
  provider fixture; Help with both TTS settings off, output selection, disconnect,
  replacement, menu exit, native restoration and existing scan policy. Browser
  working directory, profile and copied extension are disposable OS-temp paths.
- `node --test tests/communication-channel.test.cjs`: explicit routing, exact silent
  prefix, cancellation/replacement, stale results, disconnect, errors and blob cleanup.
- `node --test tests/communication-worker.test.cjs`: obsolete preparation skipping,
  cancellation during inference, warm-up/sample cache reuse and no stale playback data.
- `node scripts/check-communication-speaker.cjs`: actual settings and app buttons,
  Spacebar/Return, Auto Scan, disabled-off skipping, permission guard, iframe sharing,
  native scan isolation, all five public actions, persistence and retained messages,
  all 14 voice choices, output samples, rapid changes, mode-off and settings-exit cancellation.
- `node scripts/check-communication-speaker.cjs --real-voice --all-voices`: real model, all 14 voices, warm-up,
  fresh sentence and repeat-cache timing. Runners create/dispose an absolute OS-temp
  working directory before launching an absolute browser executable.

On this Windows PC in installed Chrome, the measured short test sentence generated
in 881 ms after a 10.1-second initial setup; its cached repeat took 5 ms. Playback
adds the 750 ms Bluetooth lead-in. The CPU-only trial took about 6 seconds for the
same new sentence. These are local measurements, not guarantees for other devices.
The follow-up run generated all 14 preview voices successfully with no failed network
requests: new previews took 286–550 ms after setup; the warmed Michael preview took
1 ms. These timings exclude the Bluetooth lead-in and physical playback.
Real Chrome enumerated nine outputs and passed muted playback with explicit sink selection on the Anker SoundCore Bluetooth output and a second output. The earlier full run passed 273 unit tests and 1,142 page/asset checks; the final preview changes passed all 12 focused channel/worker tests; the integration runner passed both switch modes and all five message actions. Physical two-device listening and the user's final switch check are still required.

The owner authorized the website repository push and a separate Electron port on October 17. Companion 1.0.9 is packaged for owner submission. The local Electron implementation adds native settings synchronization and Python control-bar Help/Suction routing; it is not included in the website source. Physical listening and Raspberry Pi testing remain manual.
The old `tests/audio-routing-poc` directory was archived in the desktop workspace's
`tmp/communication-speaker-backup-20261017/audio-routing-poc.zip` and removed.
