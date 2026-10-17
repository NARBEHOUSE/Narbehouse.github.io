# RTC Lite — web edition

A simple communication board in Benny's Hub. The user chooses every spoken message. GET / REFRESH fills eight suggested phrases; quick answers stay fixed. The keyboard, bio editor and settings use the Hub's shared switch scanner. No profile quiz is included.

## Start

1. Open Tools → RTC Lite → Continue. Continue stops the opening narration.
2. In Settings → Listening & speech recognition, select Local Whisper and Load speech model. The first download is about 150 MB. Test recognition, then finish the test to resume conversation listening. Test transcripts do not enter conversation memory.
3. In Settings → Add / edit bio, type/paste personal background, or use the predictive on-screen keyboard. Save bio. The bio is included in requests to the selected AI.
4. In AI suggestions, connect a cloud provider through Cloud AI connection, load an available local option, or configure an installed loopback AI server. Test selected AI checks the chosen option.
5. Return to the board and GET / REFRESH. The regular keyboard, dictionary and saved phrases still work without AI.

Speech and suggestions are independent choices. For local operation, choose Local Whisper plus a downloaded local AI model or a genuinely local server model. Browser speech is labeled an online service; it does not use RT Convo's Google Cloud account or this Worker. Native Parakeet and Google service-account recognition are not offered by the website.

Local AI options are experimental SmolLM2/WebLLM, Chrome's built-in AI when its interface is available, and a separately installed Ollama/OpenAI-compatible loopback server. Chrome's availability depends on browser and hardware support; the app checks it rather than promising availability on every Surface. First downloads need internet; caches can be evicted. ARM Surface performance, recognition quality and battery use still need testing on Ben's device.

For a local server, install/download a model yourself, set the exact Hub origin in the server's allowed origins, and choose the installed model in Settings. Browser local-network permission/security rules may apply. Do not disable browser security. The app accepts loopback addresses only and sends no cloud key to that server. See the server's own documentation for configuration.

## Cloud connection and privacy

Connect AI opens a separate Cloudflare setup page. Paste your own OpenAI, Anthropic or Google Gemini key there and authorize RTC Lite. A helper may be needed for ordinary typing/paste. The app stores only a revocable connection token; provider keys are encrypted in the Worker vault and expire after 30 days. Existing browser keys are never imported automatically. Disconnect revokes app access; use the Worker page to remove stored keys.

Cloud AI receives the saved bio, recent conversation text and draft through Cloudflare. The Worker decrypts the key briefly to call the provider. This is encrypted storage and HTTPS transport, not end-to-end encryption excluding Cloudflare/the operator. The Worker does not save conversation text or model responses. Provider/platform policies still apply. Cloud calls may cost money, including automatic keyboard predictions and one repair attempt for invalid output. Use provider spending controls. There is no automatic fallback from local to cloud.

The bio, defaults and preferences persist in browser storage. Conversation memory stays in memory and clears on exit/reload or Clear conversation. Audio is handled by the selected speech option. Local Whisper does not upload it. This app cannot guarantee the privacy of another extension or compromised code running on the same browser origin.

## Interaction

The bottom panel uses green LISTENING, red MIC OFF and amber PAUSED/STARTING, with words/symbols as well as color. The latest recognized words and numbered NEW CONTEXT indicator show when fresh speech is available. New speech during an older request remains marked new. Failed requests and dictionary fallback do not consume that indicator.

While local speech recognition is working, the listening panel says "Recognizing recent speech". Already recorded speech remains eligible for context even if the app starts speaking a prompt before recognition finishes; microphone capture still pauses during app speech. Setup errors stay with the microphone and Listening settings, so a resolved setup warning does not linger in the communication board footer.

Suggested replies cover different conversational purposes: agreement, disagreement or a boundary, uncertainty, clarification, a concrete answer, an alternative, a follow-up question and a related thought. The shared prompt asks local and cloud models to vary meaning across the whole board, not just reword one answer. These remain optional suggestions; the user chooses what to say.

Typing refreshes AI words and phrases using the current sentence and context. The third row and temporary AI-row fallbacks use only the existing web keyboard's web_keyboard_predictions.json. Partial words are completed; recorded ngrams supply short phrase continuations. More words/phrases refresh the selected row. Updates wait while individual choices are being scanned, and stale responses are discarded.

Select the centered text box to speak and stay on the keyboard. While editing a bio/default/announcement, the same box saves instead. Controls are below it. Color separates controls, predictions and letters. The bio editor also supports an ordinary physical keyboard without speaking or logging private profile text.

## Source and checks

- app.js / index.html: accessible UI, shared choice-scan adapter, context indicators and bio.
- core.js: bounded memory, prompts and validated completions; also used by the Worker.
- providers.js / web-config.js and ../../../shared/byok-client.js: cloud connection and local AI selection.
- dictionary.js: adapter for the website's existing keyboard prediction data.
- speech.js / whisper-worker.js, ai-worker.js / ai-generation.js, api-server.js: local/browser integrations.
- ../../../../workers/byok: separate reusable service, tests and deployment instructions.

The website integration has workerd security tests and a real Chrome test covering popup authorization with third-party cookies blocked, bio, context suggestions, keyboard completion, dictionary loading, Space/Enter scanning, Hub iframe launch/exit and layouts from 800×600 to 1366×900. They use synthetic provider responses, not real paid calls. They do not establish real model accuracy, microphone quality or Surface performance. The Electron app is unchanged by this web integration.

Application/Worker code follows the repository MIT license. Bundled components retain their own licenses and THIRD-PARTY-NOTICES.txt. vendor/manifest.json records bundled file hashes. Model downloads follow upstream revisions rather than an application-level integrity manifest; review changes before upgrading. Chrome, browser speech, Cloudflare and cloud providers have separate terms and availability. Keeping the application free/open source does not make all optional services free or open source.
