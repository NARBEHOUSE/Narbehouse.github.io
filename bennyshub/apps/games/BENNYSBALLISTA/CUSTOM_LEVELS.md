# Custom castles and static hosting

Ballista uses JSON files and a shared browser library. Game and Workshop work under a GitHub Pages project subdirectory without an upload API or server database.

## Save and reopen

- Workshop: Save castle stores the current build in this browser.
- Game: Play Game → My Castles lists the same saved builds. Select one to play, explore, export JSON, or edit in Workshop.
- Workshop shelf: Saved castles reopens a build. Editing it updates its existing entry. Choosing a built-in castle starts a separate saved copy.
- Playtest and Edit in Workshop open the exact saved castle.

## Files and your own storage

Export this castle downloads JSON. Export all saved castles downloads a collection. Keep these files locally, in a synced folder, or upload them to your own storage service.

My Castles → Import castles and the Workshop shelf both accept files and direct public JSON links. Links must return JSON rather than a sign-in or preview page. Cross-site hosts must allow browser access through CORS; an HTTPS site needs an HTTPS link. If a service blocks direct access, download its file and choose Choose JSON file. There is no cloud-account sign-in or automatic upload/sync.

Imported copies remain selectable when the original host is offline. Identical reimports do not duplicate a castle; changed files create separate copies.

Browser storage belongs to the browser profile and website origin. Export existing castles before moving from a desktop/local URL to GitHub Pages, then import them on the new site. Keep downloaded backups if browser data might be cleared. Campaign resets preserve My Castles.

## Format

A single file uses {"version":1,"level":{...}}. A collection uses {"version":1,"levels":[...]} and adds individually selectable castles, rather than a sequential custom campaign. Bare legacy castle objects are also accepted.

Exports preserve blocks, ammo, scenery, seasons, time of day, background props, moat, patrols, protected-character objectives, Rowan dialogue and endings. Assets remain part of the game.

Files are limited to 1 MB; the library holds 40 castles. Castles support 32 columns, 24 rows, 24 depth layers and 1,000 filled cells. Complete collections are validated before a single storage write. Invalid files or storage failures cannot partially add levels. The Workshop shelf can remove a saved copy after confirmation; export first to keep a portable backup.

## Verification

tests/verify-custom-library.cjs runs under an HTTP project subpath and checks actual file import/download, public links, offline-host reopening, reloads, invalid imports, storage failures, cancellation, switches, small screens and the game/editor/playtest round trip. Its temporary browser profile does not touch player saves.

Hosting references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [browser cross-origin requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## Mission goals and story guides

Optional `goals` uses `{ "enemies": "guards", "destroy": ["T"], "collect": ["stone"] }`. Enemies may be `guards`, `crowns`, or `none`. Destroy lists material IDs: every placed piece of each type must be destroyed. Collect lists ammo IDs (`stone`, `fire`, `splitter`, `bomb`): hit a corresponding crate during this attempt. All requirements must be completed. Legacy files without goals retain their crowned-guard objective. `objective: "rescue"` separately protects friendly characters and requires clearing any prison bars.

Optional `narrator` uses `{ "name": "Mira", "style": "woman" }`. Styles are `rowan`, `elder`, and `woman`; the default is Rowan. Both fields travel with JSON files, browser saves and editor drafts.

Use Playtest → Explore to watch authored patrols. Easy Aim keeps guards still while a target is selected. The Workshop identifies blocked or unsupported paths before saving or playtesting.
