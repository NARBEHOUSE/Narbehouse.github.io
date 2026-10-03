# Benny's Hub

Benny's Hub is a free, open-source collection of accessible games and everyday tools, built for Ben and families like ours. It supports one- and two-switch access, mouse input, head tracking, and eye tracking.

**[Open Benny's Hub at bennyshub.com](https://bennyshub.com)**

Use the Hub online in your browser and choose a game or tool to get started.

## Games and tools

- Play accessible arcade, sports, puzzle, and board games.
- Communicate with the predictive keyboard and customizable phrase and media boards.
- Use Companion-enabled tools for streaming, journaling, and Day Hub.
- Adjust switch scanning, input sensitivity, and voice settings to suit the person using the Hub.

## Optional browser Companion

For the Companion-enabled tools, install [Benny's Hub Companion from the Chrome Web Store](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc), then return to the Hub in the same browser profile and refresh. Other games and tools can be used without the Companion.

The Hub's **Settings** area includes Companion setup, connection checks, and data controls. Your streaming library and journal start empty so you can add your own content.

## Open source

You can also use, modify, or host your own version under the MIT License. The source code is available here for anyone who wants to contribute or adapt the tools.

---

## License

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

<details>
<summary>For developers and maintainers</summary>

Local development and release preparation are optional workflows for people changing or publishing the project.

For a local preview, run `npm install`, then `npm start`, and open http://127.0.0.1:4173/bennyshub/index.html. To test Companion features locally, load the `extension/` folder as an unpacked extension in desktop Chrome or Edge and refresh the Hub.

- [Development setup, validation, and limitations](WEB-EXTENSION-MIGRATION.md)
- [Website publishing and Companion release preparation](submission/START-HERE.md)
- [Streaming collection maintenance](submission/STARTER-COLLECTIONS.md)
- [Optional TMDB metadata Worker](workers/tmdb/README.md)

</details>
