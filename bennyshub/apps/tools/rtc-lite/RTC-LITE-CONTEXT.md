# RTC Lite web integration context

Updated 2026-10-17. This website edition is derived from the working desktop RTC Lite. Its current behavior/setup is documented in README.md. Do not use the original desktop build specification as a web credential or native-runtime design.

Keep the fixed board, shared Hub scanning, stable IDs, recurring blank root stop and row-local Back stop. Read the repository AGENTS.md, bennyshub/ACCESSIBILITY.md and developer-guide.html before changing scanning. Prediction row narration must read the current choices. Selection, never AI generation, triggers spoken output.

GitHub Pages serves the app under bennyshub/apps/tools/rtc-lite. The Tools catalog uses its own RTC Lite screenshot. The Cloudflare Worker source is under workers/byok and is deployed independently. web-config.js identifies its endpoint. Raw provider keys belong only on the separate Worker setup page. Reuse shared/byok-client.js and bounded server operations for future apps; never turn the service into an arbitrary URL/prompt proxy.

The web speech picker offers Whisper, browser online speech and Off. Desktop Parakeet and Google service-account routes are unavailable here. Local AI, Chrome availability checks and loopback server options remain. No cloud fallback occurs without user selection. Stored browser API keys are not migrated.

The bio feature supports physical typing and the predictive keyboard; no quiz. The third keyboard prediction row and fallback completions use the website's existing web_keyboard_predictions.json through dictionary.js. No new canned prediction list or duplicate dictionary was added.

Worker/browser tests are under workers/byok/tests. Real-device Surface verification remains pending. This web task does not authorize an Electron port or change its runtime. Keep vendor attributions and the manifest when copying/updating the app.
