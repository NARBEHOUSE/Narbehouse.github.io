# Store privacy fields and permission justifications

These statements describe the supplied package. Confirm the account declarations against this version before submitting; do not select “no user data” simply because most processing is local.

## Single purpose

Provide switch-accessible control of streaming playback and chosen daily-information sources launched from Benny's Hub, using the Hub's accessibility preferences.

## Permissions

**storage:** Store user-selected source settings and an optional private calendar URL locally; keep managed playback-tab identifiers, scan settings and recent episode links in session storage. No Chrome/Edge storage sync is used.

**scripting:** Register bundled player adapters and the switch control bar on streaming services only after the user grants access. The scripts operate only player tabs opened through the Hub; unrelated tabs exit without a toolbar.

**https://narbehouse.github.io/bennyshub/* content script:** Connect the Hub's web interface to a fixed allowlist of extension actions, verify the launching Hub tab, and synchronize scan preferences. No access to other GitHub Pages sites is requested by the store manifest.

**Optional streaming origins:** YouTube (www, bare and mobile); Netflix (www and bare); Disney+ (www and bare); Hulu (www and bare); Prime Video (www and bare) and www.amazon.com; play.hbomax.com, www.hbomax.com, play.max.com, www.max.com; www.paramountplus.com; app.plex.tv and watch.plex.tv; pluto.tv and www.pluto.tv. Required to find and operate the corresponding player controls when the user launches that service. Access is requested through an explicit settings action and is revocable. Amazon access supports Prime Video playback on Amazon; it is not used for shopping or purchase automation.

**https://calendar.google.com/*:** Optional. Fetch the Google Calendar iCal feed provided by the user and display the week's events in Day Hub. No content script is injected into calendar pages.

**https://feeds.npr.org/*, https://feeds.bbci.co.uk/*, https://news.google.com/*:** Optional. Retrieve news headlines for Day Hub, with an optional user-entered place name for local news. No feed content is executed as code.

**https://tubitv.com/*, https://www.tubitv.com/*:** Optional Tubi preview support. Operate media and visible player controls only in a Tubi tab launched from the Hub. Access is requested through source settings and can be revoked. Live Tubi compatibility still needs testing; generic media controls are covered by local fixtures.

The store ZIP excludes development localhost permissions and local testing UI. It requests no debugger, native messaging, cookies, history, downloads, or broad tabs permission. If you already uploaded an earlier ZIP, upload this rebuilt package and update the optional-host justification before final review; local edits do not update a submitted package.

## Remote code

Choose **No, I am not using remote code**. Extension scripts and the iCalendar parser are bundled. Calendar/news responses are parsed as data, not evaluated. The separate Hub website sends a fixed set of messages, not executable instructions or remotely supplied selectors. The Hub's on-device language model and the TMDB Worker are website features, not remotely loaded extension code.

## Data-use categories to disclose

Both stores require accurate disclosure of locally processed information. Use their current field definitions; the following is the conservative mapping for this implementation:

| Category | Relevant handling |
| --- | --- |
| Website content | Media elements/player controls and optional calendar/news response content. |
| Web history | Only managed stream URLs and the verified Hub URL for returning and episode-link updates; no general browsing history API. |
| User activity | Switch presses and playback actions, processed for controls; not uploaded or retained as an activity log. |
| Authentication information | Optional private calendar iCal URL is an access credential, stored locally and sent to Google to retrieve that calendar. Account passwords/cookies are not read. |
| Personal communications / personally identifiable information | Optional calendar event titles, descriptions and locations can include names or personal appointments; displayed for the user only. |
| Location | Optional local-news place name supplied by Day Hub and sent to Google News. Website weather coordinates go directly to Open-Meteo, separately from the extension. |

No financial, payment, credit, health-metric or diagnostic feature is implemented. Users can write arbitrary personal material in their calendar or the separate website journal; explain this context if a reviewer asks about incidental sensitive content.

## Limited-use certifications

The supplied code does not sell or transfer data for unrelated purposes, use it for advertising, or use it for creditworthiness/lending. Data use is limited to the described features. Do not change these declarations without reviewing future changes.

Privacy URL (must be publicly reachable before submission): https://narbehouse.github.io/bennyshub/companion-privacy.html

## Separate website services

The website privacy policy also covers the YouTube Search tool, including search terms sent through the separate NARBE LLC YouTube search Worker, YouTube API/player/thumbnail requests, and Cloudflare Turnstile browser/device verification. The website asks for agreement before loading those services. These website scripts are not remote executable code in the extension package.

Optional Streaming starter JSON collections contain public links and plain service cards, not private Plex servers, accounts or video files. Users choose a collection before it is merged into local website storage. Nothing is added automatically to a new library. Provider subscriptions, ads, regional restrictions and changing availability still apply.

Before launch, verify the deployed YouTube Worker's logging, caching and retention settings in Cloudflare and reflect any additional handling in the policy. Its source is not included here, so the supplied TMDB Worker's logging settings must not be attributed to it. Also review third-party licensing and applicable privacy obligations for your intended audience. These documents describe the implementation; they do not certify legal compliance or store acceptance.

Chrome policy explicitly requires disclosure even for local processing: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

Chrome fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

Edge fields: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
