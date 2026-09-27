# Replacing the old website locally

Keep the verified old-site ZIP outside the repository. It contains the old files,
uncommitted state, and Git history, and is a private recovery backup.

`releases/1.0.0/github-ready/` is the cleaned source replacement. It includes the
website, extension source, Worker source without credentials, tests, and build
tools. It excludes personal backups, old staging apps, browser profiles,
dependencies, generated art reports, and release ZIPs. The experimental working
folder remains available; do not upload that entire folder.

When ready to replace the existing checkout:

1. Preserve its `.git` directory and the external backup.
2. Compare the cleaned source replacement against that checkout before removing
   obsolete website files. Copy the replacement's contents into the repository
   root, preserving the `bennyshub/` subfolder. Do not nest the entire replacement
   inside `bennyshub/`, and do not copy backups or another `.git` directory.
3. Inspect the Git changes, including pre-existing deletions. Nothing in this
   preparation stages, commits, pushes, or resets those changes.
4. Run `npm ci`, `npm test`, `npm run build`, `npm run audit:release`, and
   `npm run check:pages`. For browser tests, run `npm start` first.
5. Use GitHub Pages with GitHub Actions to publish only the contents of `dist/`.
   The example in `submission/pages.yml.example` is manual-only; it has no push
   trigger. Enable it and configure Pages only when ready to publish. Publishing
   the whole source checkout would also expose development files unnecessarily.
6. After deployment, verify `/bennyshub/`, the Companion connection, privacy page,
   PWA/offline behavior, and signed-in streaming behavior in Chrome and Edge.

The intended repository is `NARBEHOUSE/Narbehouse.github.io`, with the Hub at
`https://narbehouse.github.io/bennyshub/`. Large site replacements should use Git
or GitHub Desktop, not a browser drag-and-drop upload of the ZIP itself.

Personal calendar links, journal entries, and streaming libraries do not belong
in the repository. Public journal/streaming templates are empty. The Cloudflare
TMDB secret stays in Cloudflare; only the public Worker URL is in the website.

Automated audits check known secret/path patterns and public asset references;
they cannot certify every image, audio file, or arbitrary user-authored passage.
Paid-provider playback still needs real-account testing before public launch.
