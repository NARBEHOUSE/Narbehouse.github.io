# Communication speaker mode

Speaker Mode defaults off. Hub Settings has a separate **Speakers** section between
general settings and Scan. Graphics Quality remains in general settings. Speaker,
Speaker voice, Speaker voice mode, Find speakers and Test speaker stay visible but disabled when off;
the existing choice scanner skips disabled buttons. When on, every control is in
the same Spacebar/Return and Auto Scan paths, with stable IDs and ordinary parking,
brake and speech-wait behavior. No additional input debounce or input lock was added.

Normal setup is: enable, select an output, select a voice. Cycling the output or
voice immediately requests a short sample through the selected speaker. Test speaker
repeats that sample (or stops current playback). Native scanning still identifies the
choice on the default output. Samples use the same cached text as voice warm-up;
quick changes discard obsolete preparation and playback rather than queueing previews.
Leaving Settings cancels its sample, and disabled mode never auditions.

Natural is the default Speaker voice mode, including for existing settings. It has 14 voices: Michael, Heart, Emma, George, Bella, Nicole, Kore, Sarah, Nova,
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
  speaker playback uses local Kokoro (Natural) or Piper (Faster) voices. No Windows helper is installed.
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

Service worker v54 caches the small routing scripts with the shell. The bundled
speech runtimes are cached only when used; Natural model/voice caching belongs to Kokoro.
Faster caches only its pinned public model/config in benny-communication-fast-model-v1.
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

## Web speech reuse repair — October 18, 2026

The desktop latency repair had not reached the website. The browser channel still unconditionally described every message as a first-use voice download. The web code now uses the same ready-voice lifetime, immediate cached-phrase responses and bounded background phrase preparation. A Hub and its embedded tools keep one speech worker while navigating between apps. Phrase Board warms short visible messages; RTC Lite warms board choices and the settled typed draft; Keyboard warms its settled draft. Background work has no playback, status announcement, recognition pause or scan-focus side effect. New selections take priority over the remaining batch. Only an inference already in progress may finish first.

The app hooks preserve website-specific Companion storage, browser AI setup, prediction layouts and input behavior. Existing open Hub tabs without the new prefetch method remain usable until refreshed. Setup failures show “not ready”; ordinary messages no longer claim to download voices. Service worker v51 refreshes the app shell without deleting Kokoro/model caches. Initial model initialization is still needed after a new Hub tab is opened, and a browser may evict downloaded assets. A new uncached sentence still needs local synthesis.

Verification: 298 unit tests passed; the existing full browser integration passed voice selection, switching, cancellation, output errors, all communication actions, real nested apps and game Help. The real Chrome reuse check generated a new sentence in 256 ms and served its repeat in 0 ms. Phrase Board, Keyboard and RTC Lite each served prepared selections from cache in 0 ms, with one shared WebGPU worker and zero additional model/voice requests after setup. Muted playback-start events were 24–27 ms; the existing 750 ms Bluetooth lead-in follows those events, so these are not click-to-audible measurements. Surface performance and physical audibility are not established by this PC's test.

Run node scripts/serve.cjs, then node scripts/check-communication-reuse.cjs to reproduce the real-worker check. Its browser executable, working directory and artifacts use absolute paths; the browser profile and working directory are disposable OS-temp directories. Results are in artifacts/communication-reuse.json. The public build, release audit and 1,186 link/asset checks passed; Companion 1.0.9's archive checksum is unchanged. No Electron runtime, extension release, driver or global Windows setting is changed by this website repair.

## Optional Faster voice — October 18, 2026

The owner reports later messages taking up to ten seconds on a Raspberry Pi 5 (8 GB), while the PC remains responsive. Natural is unchanged and remains the default. The CPU-only Kokoro path is expensive, and an active speculative inference can delay a selected message. ONNX Web CPU threading requires cross-origin isolation, which this GitHub Pages site does not enable. There is no hardware detection that changes the user's voice or quality automatically.

Settings → Speakers → Speaker voice mode cycles Natural / Faster. The choice stays in the existing device-local speaker settings and does not sync to another device. Natural retains its previous selected voice when the user tries Faster and returns. Changing mode stops the current owned ticket and terminates the old worker; only one model is retained. The shared selected-output channel, native scan voice, general-TTS independence and 750 ms Bluetooth lead-in are unchanged. The mode button is a stable item in the existing CHOICE scanner, disabled while Speaker Mode is off.

Faster uses Piper's en_US-ljspeech-medium (LJ, English female), trained from scratch on the public-domain LJ Speech dataset. It initially offers one voice; the voice-cycling button remains visible but disabled in Faster. It does not change audio playback speed. The new communication-fast-worker.js uses a pinned, vendored single-thread SIMD ONNX Runtime Web 1.18.0 and @diffusionstudio/piper-wasm 1.0.0. Runtime hashes, source links and license notices are in shared/communication-fast-vendor. The roughly 63 MB model/config downloads from rhasspy/piper-voices revision c10ece1aade47bb51c153c893d14e5bf8e5b7117; runtime assets add roughly 30 MB on first use. Natural users do not load those large assets. Build explicitly allows the phonemizer's .data file without publishing arbitrary .data files.

Faster deliberately ignores speculative phrase/draft prefetch messages so a slower CPU works on selected messages only. It reuses its loaded model and up to 32 completed messages / 16 MiB of PCM in memory. Long text is chunked without dropping words and assembled before playback. Cancelled or superseded jobs cannot play late. Model cache survives shell updates; private text and generated audio do not persist. A first setup still needs internet, and browser storage eviction can require another download.

Verification: 313 unit tests pass, including legacy Natural defaults, selected-voice restoration, mode changes during setup, stale cancellation, complete long messages and model-only cache reuse. The existing real-page integration passes all 14 Natural voices, switch/Auto access, sample cancellation, routing and app actions. scripts/check-communication-fast.cjs tests the real Faster worker through Keyboard, Phrase Board and RTC Lite with muted selected-output playback, shared worker ownership, repeat-cache hits, cancellation, persistence across reload, no Kokoro download in Faster, and a new message spoken offline. Start scripts/serve.cjs first; CHROME_PATH can select a browser executable. Evidence: artifacts/communication-fast.json and communication-fast-settings.png.

On this Windows PC in Chrome, forced single-thread CPU comparison generated the same three new texts in 304/323/431 ms with Piper versus 3661/3699/5754 ms with Kokoro q8 (roughly 11–13 times faster). The integrated Faster check generated a new sentence in 287 ms and a cached repeat in 0 ms; playback-start events were 318/26 ms before the unchanged 750 ms silent lead-in. These are PC measurements, not Pi timings or click-to-audible guarantees. Pi 5 latency and the owner's acceptance of the LJ voice still require testing on that device. No Companion release, Electron runtime, operating-system voice or device setting was changed.
