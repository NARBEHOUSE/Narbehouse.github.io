# RTC Lite web integration context

Updated 2026-10-19. This website edition is derived from the working desktop RTC Lite. Its current behavior/setup is documented in README.md. Do not use the original desktop build specification as a web credential or native-runtime design.

Keep the fixed board, shared Hub scanning, stable IDs, recurring blank root stop and row-local Back stop. Read the repository AGENTS.md, bennyshub/ACCESSIBILITY.md and developer-guide.html before changing scanning. Prediction row narration must read the current choices. Selection, never AI generation, triggers spoken output.

GitHub Pages serves the app under bennyshub/apps/tools/rtc-lite. The Tools catalog uses its own RTC Lite screenshot. The Cloudflare Worker source is under workers/byok and is deployed independently. web-config.js identifies its endpoint. Raw provider keys belong only on the separate Worker setup page. Reuse shared/byok-client.js and bounded server operations for future apps; never turn the service into an arbitrary URL/prompt proxy.

The web speech picker offers Whisper, browser online speech and Off. Desktop Parakeet and Google service-account routes are unavailable here. Desktop Chrome availability checks and loopback server options remain. SmolLM2/WebLLM was removed on 2026-10-17 after freezing reports. Do not offer or automatically reload it. Migrate saved selections to AI Off while retaining the profile, speech settings and saved phrases. Chrome Gemini Nano is for supported desktop Chrome; it is unavailable to websites on Android and iPhone/iPad. A future mobile model must demonstrate useful replies and responsive switch input on the target device before being offered. No cloud fallback occurs without user selection. Stored browser API keys are not migrated.

The bio feature supports physical typing and the predictive keyboard; no quiz. The third keyboard prediction row and fallback completions use the website's existing web_keyboard_predictions.json through dictionary.js. No new canned prediction list or duplicate dictionary was added.

Worker/browser tests are under workers/byok/tests. Real-device Surface verification remains pending. The owner extended the Steer task to PC Hub on 2026-10-19. Its matching changes preserve the native bridge, local speech and own-key cloud routes. Keep vendor attributions and the manifest when copying/updating the app.

## Steer row and suggestion focus (2026-10-19)

The board now has five rows of four buttons. The new **Steer** row follows the conversation starters. Its first three choices suggest different directions for the current exchange; **Different** is fixed and requests another board without a direction. Selecting a steer announces it through scan speech only. It never goes to public speech or conversation memory as a message from the user.

The eight replies and three steers come from the same AI request. Steers use plain, short labels (1–3 words, at most 32 characters). Invalid or absent model steers leave the replies intact and use the saved steer defaults. The defaults start as **How I feel**, **I want**, and **Ask you**. Edit **Steer 1–3** in **My phrases & profile**, after Specific phrase 4, with the existing switch keyboard and predictions. Blank, long, duplicate, and reserved Different labels are rejected with an explanation while retaining the previous value. Restore starter phrases resets both phrases and steers. Older saved data loads without migration; saved steers appear on startup, after Clear conversation, and on fallback.

When GET / REFRESH or a steer finishes, the committed board moves the root scan to Everyday phrases (generalRow) and narrates its current choices through the normal owned speech ticket. Wait for Speech still waits for that narration plus a full interval. A parked scan stays parked and Enter resumes at generalRow without selecting. If any row is entered, the update waits for that row to finish and preserves its return row. Requests completed on another screen do not move that screen. Failed requests restore saved phrases and use the same jump rules.

Quick answers and the keyboard remain usable during loading. Repeated GET/steer selections cannot start overlapping requests. Shown suggestions are tracked for the current exchange; provider prompts and the web Worker receive the latest 80 avoid items, while the client validates against the complete exchange history. New room speech begins a new exchange. Steer rows retain stable IDs, the recurring root blank, and the row-local Back stop in both directions. Five-row layout checks cover 800×600 through 1366×900.

Web cloud steering needs a separate Worker redeployment. Missing/invalid steers are omitted by core validation so the browser can apply its own saved defaults, including with an older Worker. The Worker accepts an optional steer of at most 32 characters and keeps the 80-item avoid cap.
