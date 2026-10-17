# Project documentation

Start here when developing, testing or publishing Benny’s Hub. Runtime pages stay in their existing locations; these Markdown documents are for repository readers and are excluded from the public website build.

## Current development guidance

| Guide | Purpose |
| --- | --- |
| [Accessibility contract](../bennyshub/ACCESSIBILITY.md) | Authoritative switch, scanning, speech and navigation behavior. |
| [Game developer guide](../developer-guide.html) | Public overview and release checklist. |
| [Web Companion setup and migration notes](development/WEB-COMPANION.md) | Local setup, architecture and migration context; dated release claims are historical. |
| [Graphics quality contract](development/GRAPHICS-QUALITY.md) | Hub inheritance, renderer integration and device acceptance. |
| [Desktop graphics integration](development/GRAPHICS-DESKTOP-PARITY.md) | Native boundary and desktop/web differences. |

## Testing and releases

| Guide | Purpose |
| --- | --- |
| [Switch access checklist](testing/SWITCH-ACCESS-TESTING.md) | Manual switch, parking, brake and speech checks. |
| [Graphics validation](testing/GRAPHICS-VALIDATION.md) | Recorded checks and pending device acceptance. |
| [Test scripts](../scripts/README.md) | Automated checks and their prerequisites. |
| [Publishing and Companion releases](../submission/START-HERE.md) | Website publishing and immutable Companion packages. |
| [Release validation](../submission/VALIDATION.md) | Coverage, fixture limits and remaining checks. |

## History

- [Release changelog](../CHANGELOG.md): concise release summaries.
- [Development history](history/DEVELOPMENT-HISTORY.md): detailed changes, file scope and validation. Older records describe the state at that time, not current requirements.

## What belongs in GitHub

Keep source code, runtime assets (including the game audio), licenses and credits, reproducible build/test scripts, and maintained documentation. App-specific guides stay with their app. The existing submission folder groups release instructions and checksum records.

Generated dist output, dependencies, browser profiles, screenshots used only as test evidence, backup copies, private publishing records, credentials and local release archives stay in ignored local folders. A screenshot used as a game thumbnail is a runtime asset and is tracked. GitHub Pages publishes the reviewed dist build, not this entire source repository.
