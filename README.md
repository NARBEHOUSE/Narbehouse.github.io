# Benny's Hub

> **Notice:** NARBE House, NARBE Foundation, SwitchedGames, and Benny's Hub are not affiliated with any cryptocurrency or crypto token. We accept donations only through official campaigns listed on our official websites.

Benny's Hub is a free, open-source collection of accessible games and everyday tools, built for Ben and families like ours. It supports one- and two-switch access, mouse input, head tracking, and eye tracking.

**[Open Benny's Hub at bennyshub.com](https://bennyshub.com)**

Use the Hub online in your browser and choose a game or tool to get started.

Install the Hub as an app to download its built-in games and tool files for offline use, or open **Install, offline, Companion & data → Download all games & tools**. Keep it open and connected until **Ready offline** appears; the full library needs about 500 MB. Interrupted downloads resume without downloading completed files again. Streaming, YouTube, live feeds and online AI still need internet; optional voices and AI models have separate downloads.

On the Games and Tools pages, **Sort** cycles through **A–Z**, **Recently used**, and **Most played / Most used**. The Hub saves each list's choice and ranks the full list before dividing it into pages. Counts are based on openings through the Hub on this device and begin with this feature; they are independent of analytics.

## Games and tools

- Play accessible arcade, sports, puzzle, and board games.
- Communicate with the predictive keyboard and customizable phrase and media boards.
- Use Companion-enabled tools for streaming, journaling, and Day Hub.
- Adjust switch scanning, input sensitivity, and voice settings to suit the person using the Hub.

## Optional browser Companion

For the Companion-enabled tools, install [Benny's Hub Companion from the Chrome Web Store](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc), then return to the Hub in the same browser profile and refresh. Other games and tools can be used without the Companion.

The Hub's **Settings** area includes Companion setup, connection checks, and data controls. Your streaming library and journal start empty so you can add your own content.

## Open source

NARBE-authored source code is available under the MIT License for anyone who wants to contribute or adapt the tools. Third-party game content, artwork, fonts and branding can have separate terms; review each game’s LICENSE and NOTICE before hosting or distributing a complete copy.

---

## License

© 2026 NARBE LLC

The NARBE-authored software is licensed under the **MIT License**, subject to separately identified third-party content and licenses.

You are free to use, modify, distribute, and use this software commercially, provided that the original copyright notice and license are included in all copies or substantial portions of the Software.

See the [LICENSE](./LICENSE) file for the software terms. **Chasing Rainbows has open-source implementation code and separately protected game content and artwork**; its [game LICENSE](bennyshub/apps/games/CHASINGRAINBOWS/LICENSE) and [ownership notice](bennyshub/apps/games/CHASINGRAINBOWS/NOTICE.md) identify the exclusions, credits and separate font license.

Companion packaging uses the byte-preserved `extension/LICENSE` snapshot so website branding updates do not rewrite released archives. Packaging requires every part except the separate branding paragraph to match the root license. Changes to software license terms require review of the snapshot and a new immutable release candidate.

---

## Trademark & Attribution

"Benny’s Accessibility Hub," "NARBE," "NARBE Foundation," and related names, logos, and branding are identifiers associated with the original project.

The MIT License applies to the source code only.

Use of the project name, logo, or branding does **not** grant trademark rights. This includes SwitchedGames (also presented as Switched Games and SwitchedGames.org), a product of NARBE LLC.

Forks and derivative works must not imply endorsement, sponsorship, or official affiliation with NARBE LLC or the NARBE Foundation without written permission.

If you redistribute modified versions of this software, you must clearly indicate that your version is a derivative work and not the original project.

For partnership or branding inquiries, please visit:
[https://narbehouse.com](https://narbehouse.com)

---

## Disclaimer

This accessibility software is not medical software and is provided “AS IS,” without warranty of any kind, express or implied.

The keyboard, phrase board, and other communication features are supplemental tools and are not a replacement for a prescribed augmentative and alternative communication (AAC) device.

---

<details>
<summary>For developers and maintainers</summary>

Local development and release preparation are optional workflows for people changing or publishing the project. Start with the [documentation index](docs/README.md).

| Folder | Contents |
| --- | --- |
| `bennyshub/` | Hub, games, tools and shared runtime assets |
| `extension/` | Optional browser Companion source |
| `workers/` | Optional backend services |
| `docs/` | Development guides, test checklists and history |
| `scripts/` and `tests/` | Build, release and automated checks |
| `submission/` | Companion publishing instructions and checksums |

For a local preview, run `npm install`, then `npm start`, and open http://127.0.0.1:4173/bennyshub/index.html. To test Companion features locally, load the `extension/` folder as an unpacked extension in desktop Chrome or Edge and refresh the Hub.

- [October 2026 scan-upgrade test guide](docs/testing/SWITCH-ACCESS-TESTING.md)
- [Development setup, validation, and limitations](docs/development/WEB-COMPANION.md)
- [Website publishing and Companion release preparation](submission/START-HERE.md)
- [Streaming collection maintenance](submission/STARTER-COLLECTIONS.md)
- [Optional TMDB metadata Worker](workers/tmdb/README.md)

</details>
