# Streaming starter collections

The default library and episodes stay empty. The editor offers 223 optional public
links: Netflix 50, Disney+ 81, Hulu 37, Prime Video 12, Tubi 37, YouTube 6.
This initial selection is U.S.-oriented with a family mix; it is not an age-rating
certification or a promise that a particular account can play each title.
YouTube contains free **short films**, not feature-length movies.

Each collection lives in `bennyshub/apps/tools/streaming/collections/` as a
downloadable JSON file. Each entry includes its public source URL and reference
review date. The index supplies service counts, display notes and allowed hosts.
The source links were reviewed on September 27, 2026; signed-in entitlement,
country availability and automatic player startup were not verified for each link.
Titles may redirect, require a subscription or paid offer, or leave a catalog.

Reference sources include the providers' own title pages, Disney's
[family movie guide](https://www.disneyplus.com/explore/articles/family-movies-watch-guide),
[Netflix family catalog](https://www.netflix.com/browse/genre/783),
[Disney animation guide](https://www.disneyplus.com/explore/articles/disney-animated-movies),
[Hulu kids series](https://www.hulu.com/hub/kids-tv),
[Prime family catalog](https://www.primevideo.com/storefront/kids),
[Tubi classics](https://tubitv.com/category/kid_classics),
and official Blender creator uploads such as
[Big Buck Bunny](https://www.youtube.com/watch?v=aqz-KE-bpKQ),
[Spring](https://www.youtube.com/watch?v=WhWc3b3KhnY) and
[Wing It!](https://www.youtube.com/watch?v=u9lj-c29dxI).
No private Plex server links, video files or affiliate tags are bundled.
Collection metadata is populated through the same configured TMDB Worker as
the editor Auto-Fill: descriptions, poster URLs, release years, genres, credits
and available YouTube trailers. No generated service SVGs are used as posters.
TMDB does not supply a trailer for every title; a missing trailer stays empty.
All 223 titles have TMDB posters and descriptions; 189 have trailers in TMDB.
Three Tubi links with unresolved season/series matching are held out of this
release, rather than assigning metadata from a different series.
The editor retains its existing TMDB attribution. Refresh metadata with
`node scripts/enrich-starter-collections.cjs --refresh` and review ambiguous
matches recorded in `artifacts/starter-metadata-review.json`.

Quick add is collapsed inside Add New Video. Its preview supports title search,
type filters and selecting visible titles; the total also identifies selections
hidden by filters. Saving reports added/skipped counts. Existing
entries, custom descriptions, and links win. JSON library imports follow the same
merge rules; episode imports also preserve an existing season/episode number.
Manual Add and inline URL edits reject matches. Known URL forms normalize
YouTube short/watch/embed links, Netflix title/watch links, provider tracking
parameters and trailing slashes. Unknown query parameters and Plex fragments are
preserved to avoid collapsing different content. Different provider IDs for the
same work cannot always be recognized; this is URL duplicate protection, not
title-based deduplication across services.

To update a collection, verify the provider page, add/edit the JSON entry, update
its review date and index count, then run `npm test`, `npm run build`,
`npm run audit:release` and `npm run check:pages`. Do not put a private catalog in
`data.json` or `episodes.json`. Re-adding an updated collection adds only new links;
it never silently updates or removes a user's previous entries.

After a bulk add/import (or five individual additions in a session), a dismissible
reminder offers a full JSON backup. It uses the existing export format, including
library entries, episode lists and genres. Clearing browser site data can remove
local entries; import the backup on the same or another computer to restore them.
