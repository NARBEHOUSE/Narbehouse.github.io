# Companion installation and developer previews

Public users install [Benny's Hub Companion from the Chrome Web Store](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc), then refresh the public Hub in the same browser profile. The setup page makes this the primary action and keeps connection checking and source selection available below it.

Desktop Edge users can use that same Chrome listing through Edge's supported installation flow for extensions from other stores. This does not imply a separate Edge Add-ons approval or listing. Add an Edge Add-ons URL only when it is available.

People moving from an unpacked preview should disable that copy before installing the store version so two copies do not compete. Keep the disabled copy while checking the new installation. Extension settings and source permissions may need to be entered again; saved Hub data remains in the same browser profile.

The collapsed developer-testing section retains the generated production-origin ZIP and manual extraction, Load unpacked, reload, and removal instructions. It is for development and testing. That ZIP does not install itself, receive store updates, or connect to localhost. Use the workspace's development extension for localhost testing. Developer mode is not the public installation route.

Official installation references:

- [Chrome installation help](https://support.google.com/chrome_webstore/answer/2664769?hl=en).
- [Microsoft Edge installation from the Chrome Web Store](https://support.microsoft.com/en-gb/edge/add-turn-off-or-remove-extensions-in-microsoft-edge).
- [Chrome development testing](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
- [Edge local testing](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).

Packaging scripts only prepare local artifacts. Store updates are submitted separately; pushing the website to main runs the website validation and deployment workflow.
