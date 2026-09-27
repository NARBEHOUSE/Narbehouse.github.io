# Companion preview before the store release

The setup page says store installation is not available yet. It makes no claim
that a review has started or that Google/Microsoft has approved the extension.
Confirm actual submission status in each publisher dashboard separately.

General users should use the future official store links. A collapsed
developer/tester section provides the generated production-origin ZIP, extraction,
Load unpacked, manual updates, removal, and migration instructions. The ZIP does
not install itself and does not connect to localhost. Keep the development source
extension for localhost testing. Do not direct users to disable Safe Browsing,
antivirus, or organization restrictions.

An as-is/use-at-your-own-risk notice explains preview limitations. It does not
replace store requirements, privacy disclosures, consumer rights, or legal review.
Do not market developer mode as the normal public installation method.

Official references checked September 27, 2026:

- [Chrome distribution](https://developer.chrome.com/docs/extensions/how-to/distribute):
  unpacked extensions are for trusted code during development; ordinary public
  installation uses the Chrome Web Store. Self-hosting on Windows/macOS is limited
  to managed enterprise distribution.
- [Chrome Load unpacked instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
- [Edge local testing instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).

After approval, replace the preview-first copy with the actual Chrome/Edge store
links. Keep any development instructions secondary. Never invent a listing ID.
Publish the privacy page before requesting review. No preparation script deploys
the website, submits the extension, or edits an existing store submission.
