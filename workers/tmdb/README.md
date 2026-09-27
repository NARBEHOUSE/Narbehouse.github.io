# TMDB metadata Worker

The public Hub calls this Worker for movie/show metadata. The shared TMDB credential stays in Cloudflare. KenLM predictions remain entirely on-device and do not use this Worker.

## Deploy once

1. In this directory run `npm install`, then `npx wrangler login` to sign in to your Cloudflare account.
2. Review the allowed website origins in `wrangler.jsonc`. Remove development origins for production if you no longer need them. Rate-limit namespace IDs must be unique in your account.
3. Run `npx wrangler deploy`. The initial deployment refuses metadata requests until a secret is configured.
4. Run `npx wrangler secret put TMDB_READ_TOKEN`. Paste the **API Read Access Token** from your TMDB account's API settings at the hidden terminal prompt. Alternatively, use `npx wrangler secret put TMDB_API_KEY` with your existing v3 key. Configure one credential; the read token takes precedence.
5. Copy the deployed HTTPS Worker address into `workerURL` in `bennyshub/apps/tools/streaming/metadata-config.js`. That address is public and safe to publish. Never put the credential there.
6. Build and publish the website's `dist` output, then refresh the editor. With a Worker URL configured, the personal-key field disappears and Auto-Fill/Batch Update use the Worker.

Before deployment, the existing personal-key mode remains available. Its key stays in the editor tab. No Worker URL or credential is invented or bundled.

## Scope and limits

- GET only: `/3/search/multi`, `/3/search/movie`, `/3/movie/{id}`, `/3/tv/{id}`. Optional details are limited to credits/videos; search excludes adult results.
- Fixed TMDB upstream, bounded queries, no arbitrary URL proxying, no account writes, no user sessions, and no credential in client responses or cache keys.
- Public metadata caches for five minutes (search) or one day (details). Logs are disabled in this configuration, and the Worker does not log requests or secrets.
- CORS permits only configured website origins. CORS is **not authentication**: a caller outside a browser can forge Origin. Rate limits constrain anonymous access; they are per Cloudflare location, not a global spending/quota guarantee. Shared-IP users also share a limit. Add authenticated access or Turnstile if public abuse becomes a problem.
- A previously published key should be replaced in TMDB; deleting it from the newest Git commit does not revoke it.

TMDB requires attribution and distinguishes non-commercial and commercial use. Keep the TMDB logo and attribution in the editor; review your use against its terms.

References: https://developer.themoviedb.org/docs/authentication-application, https://developer.themoviedb.org/docs/faq, https://developers.cloudflare.com/workers/configuration/secrets/, https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

Deployed endpoint: https://bennys-hub-tmdb.narbehousellc.workers.dev . The Hub metadata configuration now uses it. The Worker trims surrounding credential whitespace and also accepts a 32-character TMDB API key in the read-token secret, using it only on the server. Errors expose only fixed diagnostic categories and upstream HTTP status codes, never credentials or raw upstream responses.
