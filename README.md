# Benny's Hub — local release preparation

Store ZIPs, screenshots, publisher copy and preparation instructions are built under `releases/1.0.4/`. Start with [the submission guide](submission/START-HERE.md). Pushing to `main` automatically runs the tests, build, public-file audit and link checks, then publishes the website if all checks pass. Local edits and commits alone do not publish. Extension store submissions remain separate. The public streaming library and episodes start empty.

On GitHub, a yellow indicator means checks are running, a green check means the workflow succeeded, and a red X means it failed. If a required build check fails, the current live website stays in place. Click the indicator or open **Actions > Publish reviewed website** for details.

For a clean repository replacement, run `npm run build`, `npm run audit:release`,
`npm run check:pages`, then `npm run prepare:github`. The result is
`releases/1.0.4/github-ready/`. Follow [the replacement guide](submission/REPLACE-WEBSITE.md)
to preserve your old checkout and publish only the `dist/` website when ready.

The three companion apps are implemented under Benny’s Hub → Tools. See [setup, validation and current limitations](WEB-EXTENSION-MIGRATION.md).

For a local preview: `npm install`, then `npm start`, and open http://127.0.0.1:4173/bennyshub/index.html. Load the `extension` folder as an unpacked extension in desktop Chrome/Edge and reload the Hub.

Builds require Node.js and Python 3. `npm run build` generates the production-origin
Companion preview ZIP inside `dist/bennyshub/downloads/`; this is a developer/tester
download, not a store install. See [preview distribution guidance](submission/PREVIEW-DISTRIBUTION.md).

The Streaming editor offers six optional Quick add collections (223 public title links).
JSON imports merge into the existing library and skip matching URLs. See
[collection maintenance and sources](submission/STARTER-COLLECTIONS.md).

Streaming keeps the original catalog link and saves the latest episode/playlist URL separately on this device. Continue uses that saved link; Start Over clears it. Plex retains its own progress handling. Help & shortcuts pauses video and offers spoken help, keyboard, phrase board and Hub main-menu access.

Companion setup and data controls are in the collapsed **Settings** area at the top, outside switch scanning.

The Keyboard now uses on-device KenLM with a local fallback; see [model details](bennyshub/apps/tools/keyboard/kenlm/README.txt). The optional [TMDB Worker](workers/tmdb/README.md) keeps a shared metadata credential off GitHub Pages.

---

# Narbehouse.github.io

© 2026 NARBE LLC

This project is licensed under the **MIT License**.

You are free to use, modify, distribute, and use this software commercially, provided that the original copyright notice and license are included in all copies or substantial portions of the Software.

See the [LICENSE](./LICENSE) file for full details.

---

## Trademark & Attribution

"Benny’s Accessibility Hub," "NARBE," "NARBE Foundation," and related names, logos, and branding are identifiers associated with the original project.

The MIT License applies to the source code only.

Use of the project name, logo, or branding does **not** grant trademark rights.

Forks and derivative works must not imply endorsement, sponsorship, or official affiliation with NARBE LLC or the NARBE Foundation without written permission.

If you redistribute modified versions of this software, you must clearly indicate that your version is a derivative work and not the original project.

For partnership or branding inquiries, please visit:
[https://narbehouse.com](https://narbehouse.com)

---

## Disclaimer

This accessibility software is not medical software and is provided “AS IS,” without warranty of any kind, express or implied.

---
