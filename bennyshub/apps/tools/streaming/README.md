# Streaming library and episodes

Open Streaming > Settings > Edit Library. In the video list, TV shows have a **Seasons & Episodes** button. Add or remove seasons, then edit each episode's number, title and complete playback URL. **Use current playback link as Season 1, Episode 1** starts an empty list from the show's existing link.

Episode lists are optional. Removing every season returns the show to single-link playback. Empty seasons are omitted on save. Season 0 from older imports is retained for special/default links and is not listed in the season picker. Continue prefers a numbered season when no saved progress exists.

**Save episodes** validates every season, including hidden rows. Duplicate episode numbers within a season, empty titles and invalid URLs are rejected. **Discard changes** closes without saving. If device storage is full or disabled, the dialog keeps your draft for retrying.

Reopen the show in Streaming to see saved changes. Renaming a show keeps its original episode association through `episode_key`. Imports from the older app use its existing JSON format: show names mapped to season numbers and episode arrays. Import the catalog and episodes through **Library files**; spreadsheets and Python/desktop endpoints are not used.

Changes live in this browser's local storage on this website origin. Export the library and episodes as a JSON backup before clearing site data or moving computers. The export includes episode associations. Saving one show's episodes preserves the other shows. Playback still uses the Companion and its existing service permissions; a platform label in the editor does not add Companion support for that service.

Platform names and locally bundled favicons are shared by the editor and player. Source URLs are recorded in `logos/favicons.json`; the app does not fetch those source URLs for badges. Details and scan announcements include the platform name. The details popup keeps its description in a scrolling reading area and its controls visible below it.

Validation: `npm test`, `npm run test:streaming-episodes`, and `npm run test:streaming` (set `HUB_TEST_ORIGIN` to the local preview origin as needed). Browser tests use synthetic catalogs and simulated playback requests, not streaming accounts.
