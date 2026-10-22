# Benny’s Hub Mobile

A Codex Physical Builds project by NARBE House: two switches, a Raspberry Pi and a personal display, built around Ben as a portable supplement to his main Surface setup.

- Project page: https://narbehouse.github.io/codex-physical-builds/
- Benny’s Hub: https://bennyshub.com
- Hub source: https://github.com/NARBEHOUSE/Narbehouse.github.io
- Companion source: https://github.com/NARBEHOUSE/Narbehouse.github.io/tree/main/extension

## Why this build exists

Ben is nonspeaking and quadriplegic due to a rare condition. He uses right and left head movements to communicate yes and no.

For years, Ben went without access to a computer system that worked for him. Using AI-assisted coding, we built a custom setup around the movements he already uses, giving him more choice over what he plays, watches and shares with the people around him.

Ben is also low vision. Those same head movements operate his switches, but with a conventional monitor each turn takes his eyes away from the screen. The glasses keep the display in front of his eyes while he makes selections.

Ben has tested the complete kit with games, streaming and communication, both in his chair and in bed. Our family’s experience has been encouraging; the setup is still being fine-tuned. Build for one, extend to many.

## Alongside Ben’s main Surface setup

Ben still uses his main Electron app on his Surface Pro. The Raspberry Pi kit supplements it for on-the-go use and currently runs the web version of Benny’s Hub, with a substantial collection of games, streaming and other tools.

Two tools Ben uses on the Surface are not available in this setup:

- **Broader web search:** Ben’s desktop search app gives him access to more of the web. The web Hub currently offers YouTube-only search.
- **Messenger:** Ben’s desktop messenger mirrors Discord. We have not implemented a web-based version.

Bringing either tool to the web Hub would need further exploration. Feasibility is still an open question, and there is no commitment or timeline to add them. The Pi is already a useful portable supplement with its current web apps.

## Hardware

| Part | Role | Reference |
| --- | --- | --- |
| Raspberry Pi 5, 8 GB | Runs Chromium and the Hub | [Raspberry Pi](https://www.raspberrypi.com/products/raspberry-pi-5/) |
| Older VITURE XR glasses and battery/dock arrangement | Personal display, near-ear audio and portable power | [VITURE dock documentation](https://www.viture.com/academy/mobile-dock/pro-one-series) |
| Two 3D printed SwitchedToys switches | Ben’s head-operated inputs | [Switch designs](https://www.switchedtoys.org/collections/3d-printed-switch-files) |
| Adafruit TRRS Trinkey | Switch input to USB Space and Enter | [Product](https://www.adafruit.com/product/5954), [guide](https://learn.adafruit.com/adafruit-trrs-trinkey) |
| Bluetooth speaker | Audible messages and Help requests | Select a compatible output in Hub Settings → Speakers |

The exact glasses model and wiring should be confirmed before reproducing the hardware connections. Use the Pi’s HDMI output and a compatible dock/adapter; its USB-C power connector is not a video output. The working battery estimate is 4–6 hours of typical use, not a measured runtime result.

## What changed for the Pi

1. **Shared graphics quality:** High / Standard / Low. Low reduces rendering cost in supported games while preserving timing, inputs and readable HTML controls. Ben’s Pi uses Low. See [graphics notes](../docs/development/GRAPHICS-QUALITY.md).
2. **Browser Companion:** A browser extension replaces the desktop Python-helper approach for supported streaming services. The personal library organizes links with optional TMDB metadata; the accessible player bar provides playback and a return route. Service accounts, subscriptions and browser restrictions still apply. [Install Companion](https://chromewebstore.google.com/detail/bennys-hub-companion/mgebpldbnicoldgheklaaocloplgmmkc).
3. **Separate speech output:** Communication Speaker Mode routes messages and Help requests to an external output while media and normal scan feedback stay on the default output.
4. **Faster and custom voices:** Optional Faster mode uses lighter Piper models and reuses loaded models/completed messages. Natural mode supports custom Voice Studio files. Bryan helped make custom voice support possible. The engines synthesize messages on-device after initial model downloads. Voice/model licenses vary.
5. **Pi Bluetooth policy:** With RTC listening and a separate USB microphone, WirePlumber’s headset auto-switching could degrade Bluetooth output. Disabling that switching produced consistently clear speech across several messages on this build.

The detailed speech implementation, reported Pi experience and validation limits are in [Communication Speaker](../docs/development/COMMUNICATION-SPEAKER.md). PC timings are not Pi performance measurements.

## Setup

### 1. Switches

Configure the TRRS Trinkey so one switch sends Space and the other Enter, including correct key releases and holds. Use wiring/splitters appropriate to the switch connectors. See [trinkey/README.md](trinkey/README.md) for the status of Ben’s exact firmware.

### 2. Browser and Companion

Open https://bennyshub.com in Chromium on Raspberry Pi OS. Install Companion in that browser profile, refresh the Hub, and follow [Companion setup](https://narbehouse.github.io/bennyshub/extension-setup.html). Install the Hub as an app only if offered by the browser. New public libraries and journals start empty. Add your own links, sign in to your services and export important data as backups.

### 3. Display and audio

Connect HDMI through the dock/adapter appropriate to your VITURE glasses. Pair the Bluetooth speaker in the OS. Keep the glasses as the default media output. In Hub Settings → Speakers, enable Communication Speaker Mode, choose the speaker and test it. Browser device permissions may need caregiver assistance.

### 4. Settings

Set Graphics quality to Low. Return individual games with existing overrides to Use Hub setting as needed; reopen if full changes apply next launch. Try Faster speech when CPU generation is too slow. Natural mode supplies custom voices. Set scan timing, sensitivity and spoken feedback with the person using the system.

### 5. Kiosk mode

Close current Chromium windows and launch the same configured profile:

```bash
chromium --kiosk https://narbehouse.github.io/bennyshub/
```

Older installations may use chromium-browser. Alt+F4 on a connected keyboard exits kiosk mode.

### 6. Startup on a labwc desktop

Preserve existing entries in ~/.config/labwc/autostart and add:

```bash
chromium --kiosk https://narbehouse.github.io/bennyshub/ &
```

Restart and confirm the browser profile, Companion and audio routing. Other desktop environments differ. [Official Raspberry Pi kiosk tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/).

### 7. Optional Bluetooth fix

This applied to the Pi with WirePlumber 0.5.8 and a separate USB microphone. Turn RTC listening off and allow normal output quality to return. Test:

```bash
wpctl settings bluetooth.autoswitch-to-headset-profile false
```

Turn listening back on and verify microphone input and speech quality. Once successful, save:

```bash
wpctl settings --save bluetooth.autoswitch-to-headset-profile false
```

This changes the current Pi user’s audio policy. Re-enable headset-microphone auto-switching with:

```bash
wpctl settings --save bluetooth.autoswitch-to-headset-profile true
```

Speech quality was confirmed across several messages; persistence after reboot still needs confirmation. [WirePlumber reference](https://pipewire.pages.freedesktop.org/wireplumber/man/wpctl.html#settings).

## What remains to document

- A measured full battery runtime.
- Exact Trinkey firmware, connector wiring and glasses model.
- A physical-build demo video.
- Broader device testing and Bluetooth policy persistence after reboot.

## Page development

This is a standalone, buildless HTML/CSS/JavaScript page. The repository’s npm start preview serves /codex-physical-builds/. The main website links here as a project; no navigation link is added to Benny’s Hub or SwitchedGames.

The source photographs remain unchanged. The page uses compressed JPEG derivatives and real screenshots of the current Hub. The “Hi everyone” photograph shows the display mirrored to a TV during testing; TV mirroring is not enabled by default or included in the standard portable setup. The personal-library screenshot is illustrative; it is not a shipped starter collection. The small Play / Watch / Speak example remains an illustration. The page itself now uses the Hub’s shared choice scanner for navigation.

Source inputs: the supplied write-up and VS Code handoff, labeled project photographs, current Hub UI, maintained graphics/speech implementation notes, and official vendor documentation. The original write-up is preserved; this page uses current labels and qualifies estimates.

## Explore the project with switches

The page is a demonstration of Ben’s two-button navigation and text-to-speech. Benny’s Hub builds these controls directly into the specific apps he wants to use, with simpler layouts tailored to his needs. The introduction itself is scannable and readable aloud.

The page is designed for Space and Enter switch inputs. Choose **Try switch browsing**, or press Space outside an ordinary button or link. Space moves between sections; Enter opens a section’s choices. The first choice reads that section aloud, followed by its links, photos and smaller groups. A silent blank separates the last and first sections. Each entered group loops through its choices and a spoken **Back** stop, which restores the previous selection. The dashed Back cue stays in the control bar or current dialog and names its destination; it does not outline unrelated page content.

- During narration, Enter stops speech; Space stops it and moves on. The current passage is highlighted and scrolled into view. Browser speech is chunked through the shared voice manager and remains interruptible.
- Photos have scannable description and close controls. Setup steps can be opened, read, copied and closed with the switches.
- Every content group includes scannable **Sections** and **Controls & help** buttons. Sections restores the containing section in the root list; closing help restores the exact choice that opened it. The Sections button is disabled when already in the section list. Mouse/touch Next and Choose buttons mirror the two switch inputs and do not add recursive scan stops.
- **Controls & help** includes spoken instructions, speech on/off, voice selection, Auto Scan and scan speed. The page uses the same-origin Hub’s saved scan and voice preferences. Parking, Space Brake and Wait for Speech remain configured in Hub Settings.
- Auto Scan offers Enter-only selection after it is enabled. Held Space scans backwards in manual mode using the existing three-second Hub convention; no hold is needed to go forward or return.
- Links selected with switches show a cancel-first handoff. The Benny’s Hub links use the same-origin web app, preserving preferences. Other pages and external sites may need ordinary controls. Browser Back returns to the project; this page does not add its own controls to another site.
- Mouse, touch and ordinary keyboard navigation remain available. Tab, Shift+Tab or **End switch browsing** exits switch mode without removing native links and buttons from the tab order. No speech or automatic scanning starts before the visitor opts in.

Implementation: `switch-access.js` supplies explicit section/group identities and input ownership to `NarbeChoiceScanAdapter`; shared platform, scan, voice and status modules are loaded from `../bennyshub/shared/`. All contexts on this page are CHOICE scans. Shared modules, gameplay and the Electron app are unchanged. The page requires JavaScript for scanning and a working browser voice for narration; its text and native links remain readable without speech.

Validation covers keyboard and browser behavior. The complete experience still needs testing with Ben’s physical switches, preferred voice and display before calling it hardware-verified.

## Independence and intended use

### Our relationship with OpenAI

Benny’s Hub Mobile is a personal, experimental project built with Codex. NARBE House is independent of OpenAI. Our relationship with OpenAI is limited to participation in the Codex Physical Builds project, which supplied the Raspberry Pi used in this build, and occasional sharing of social-media posts.

This is not an official OpenAI product. Hardware support, project participation or social-media sharing should not be taken as OpenAI endorsement, certification, or validation of this build.

### Entertainment only. No AAC or medical claims.

This build is shared for entertainment purposes only. We do not offer, market, or make claims for it as an augmentative and alternative communication (AAC) system, medical device, or therapeutic product.

Its keyboard, phrase board, speech output, and Help features are experimental recreational features. They are not a substitute for prescribed AAC equipment, professional assessment, or a care plan. Do not rely on them for essential communication, medical needs, emergency alerts, or safety-critical assistance.

Personal experiences described here are not clinical evidence or guarantees of suitability or reliability.

## Credits and licenses

The Raspberry Pi used in this build was supplied by OpenAI through the Codex Physical Builds project.

Ben: purpose, direction and testing. Bryan: custom voice support. SwitchedToys: switch designs. Adafruit: TRRS Trinkey. Raspberry Pi and VITURE: hardware. Open-source contributors: browser speech and game technology. NARBE House: development and integration with Codex.

NARBE-authored software is MIT-licensed under the repository [LICENSE](../LICENSE). Photographs, branding, hardware designs, voice models, movie artwork and other third-party assets have their own rights and terms. See the shared speech [runtime notices](../bennyshub/shared/communication-vendor/THIRD-PARTY-NOTICES.txt) and [Faster voice notices](../bennyshub/shared/communication-fast-vendor/THIRD-PARTY-NOTICES.txt).

This site was built with Codex as part of the Codex Physical Builds project.
