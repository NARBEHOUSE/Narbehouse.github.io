# Benny's Hub BYOK Worker

Reusable key storage, browser connection and provider plumbing for Hub apps. RTC Lite is the first registered app. The static app stays on GitHub Pages; this service runs separately on Cloudflare Workers. Deploying Pages does not deploy this Worker. No NARBE provider key is supplied.

## Use

RTC Lite: Settings → AI suggestions → Cloud AI connection → Connect AI. A separate Worker page accepts an OpenAI, Anthropic or Google Gemini key and a supported model. Saving a key does not call the provider. The user explicitly connects RTC Lite. A helper may be needed for typing/paste during setup. Existing API keys in browser storage are never imported automatically.

The browser receives a revocable app token, not the provider key. Connections and keys expire after 30 days. Disconnect revokes the app token. The Worker setup page can remove a provider key or delete all keys for that browser session. Clearing cookies alone does not immediately delete server data; use Delete all first. An expired or lost session must reconnect. There is no account login, cross-device sync or recovery of keys.

## Security and privacy boundary

Public source is intentional. Keep VAULT_KEY, provider keys, account credentials and local runtime state out of Git. A public account ID and endpoint are identifiers, not credentials. Cloudflare's encrypted secret binding holds VAULT_KEY. Each user vault encrypts provider keys using AES-256-GCM with a fresh IV and vault/provider-specific authenticated data. It stores hashes of authentication secrets, bounded request IDs, counters and expiry metadata. It does not store prompts, bios, transcripts or responses, and application request logging is disabled.

The Worker necessarily decrypts the key in memory to authenticate an upstream request. HTTPS protects each hop; this is not end-to-end encryption that excludes the service operator. Cloudflare and the selected provider process request data. Provider retention/usage policies and Cloudflare platform retention/backups remain applicable. Deletion removes active application data, not a promise of immediate removal from every platform backup.

Key management uses a Secure, HttpOnly, SameSite=Strict cookie on the Worker origin, plus same-origin and custom-header checks. Connection uses a short-lived one-time code bound to a random SHA-256 verifier, app and exact origin. The opener checks the popup window, origin and random state. API requests use an app-scoped bearer token with credentials omitted; third-party cookies are unnecessary. Origin checks supplement authentication; CORS alone is not authentication and non-browser clients can forge Origin.

Only fixed RTC operations, provider hosts and model IDs are allowed. There is no arbitrary URL, prompt proxy, key-read route or owner-funded fallback. Redirects are not followed. Responses and inputs are bounded and validated. Each vault allows two concurrent operations, 60 provider calls per minute and 2,000 per UTC day by default. Invalid model output can cause one repair call, counted separately. Network/auth/quota failures are not automatically retried. Duplicate IDs are rejected for ten minutes. Canceling a browser request cannot undo a provider request already started or its charges.

The configured IP rate limits are Cloudflare location-local controls, not a global spending guarantee. New anonymous vaults and public traffic still consume Worker/account resources. Other Workers share account quotas. Provider spending controls remain necessary; BYOK does not guarantee free hosting or inference.

All apps under one GitHub Pages origin share browser storage and origin trust. Compromised same-origin code/XSS could use an app token until revoked/expired; it cannot use this API to retrieve the provider key. A separate origin per app would provide stronger browser isolation. Keeping source private would not resolve that boundary.

## Development and deployment

Use Node 22.16+ with npm. From this directory:

    npm ci
    npm run types
    npm run check
    npm test
    npm run test:browser

The browser check also needs the website root npm dependencies and Google Chrome. It launches Chrome from its own disposable OS-temp cwd, uses synthetic keys/providers, blocks external browser requests and makes no paid provider calls. Artifacts go to the website artifacts/rtc-lite folder. Unit integration tests run the actual bundled Worker in workerd/Miniflare, including encrypted storage, expiry, authentication, quota, replay, concurrency and redirect checks.

For a fork, set account_id and exact APP_ORIGINS in wrangler.jsonc, choose a unique Worker name and update the app's web-config.js endpoint. Do not allow wildcard origins. Run wrangler login using your own account, then:

    npm run deploy
    npm run init:vault

The initializer generates 32 random bytes in memory and pipes them to wrangler secret put. It never writes or prints the secret, and leaves an existing VAULT_KEY unchanged. Deploy is fail-closed until the secret exists. GET /health reports ready. Do not rotate/remove VAULT_KEY casually: existing encrypted keys would become unreadable. Users can revoke provider keys at the provider if a deployment or secret is compromised. Keep the SQLite Durable Object migration history when updating.

For local development, an ignored .dev.vars can contain a disposable 64-hex VAULT_KEY; use only test keys. Never add .dev.vars, .wrangler, node_modules, dist or real keys to a source handoff. The root Pages build excludes this entire directory.

## Protocol and extending to another app

GET /connect and /setup.js serve first-party key setup. /api/byok/v1/manage handles status, save, remove, connect and delete-all with management authentication. POST /api/byok/v1/exchange trades a one-time code for a connection. GET/DELETE /api/byok/v1/connection checks/revokes it. POST /api/byok/v1/apps/rtc-lite/generate accepts structured board/predictions inputs. The reusable browser implementation is ../../bennyshub/shared/byok-client.js.

Adding an app requires an explicit route, app allowlist entry, bounded input schema, server-owned prompts, output validator and tests, plus setup consent wording. Reuse vault encryption/auth and the client. Do not enable a generic public proxy or accept caller-selected upstream URLs. Current grants deliberately recognize only rtc-lite; existing Music Maker/TMDB Workers are unchanged.

## RTC Lite steers (2026-10-19)

The board operation accepts an optional `steer` string, up to 32 characters, using the same bounded text validation as other fields. It is added to the server-owned board prompt, grounded in the latest room statement. The prompt/schema requests eight suggestions and three steer labels in one response. Invalid or missing model steers are omitted while the eight replies remain usable, so the client can apply its personal saved defaults without a repair call. Existing clients may omit steer; the avoid list remains capped at 80.

**Redeploy this Worker for steered cloud AI.** A static website release alone cannot update its prompt or schema. No vault migration or key rotation is needed. The PC Hub native own-key path is independent of this Worker.
