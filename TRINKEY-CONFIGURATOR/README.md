# NARBE Trinkey Configurator

A static site for the two switches on NARBE's covered Adafruit TRRS Trinkey. Setup uses an ordinary mouse and keyboard and is independent of Hub switch scanning.

## Local testing and GitHub Pages

Double-click **START-LOCAL.bat**, or run npm start here. Open **http://localhost:4173** in desktop Chrome or Edge. Node 18+ is needed only for the local server. Customers need no desktop application.

The NARBE House build publishes a curated runtime at /trinkey-configurator/. scripts/trinkey-public.cjs verifies installation-file hashes and copies only the browser assets, customer guide and required firmware. Local backups, test scripts, reference images and development notes are excluded. The Foundation switch-kit guide links directly to the tool; the NARBE House homepage links to the Foundation newsletter instead. All fetch URLs are relative; GitHub Pages needs no backend, login, or secret.

## Customers receiving the current device software

The plugged-in production-style unit exposed USB ID 239A:8157 and TinyUSB keyboard/serial interfaces. It did not implement the configurator commands. The supplied desktop-updater folder instead contains CircuitPython 10.0.3. Both starting points are accounted for.

A unit with the original software needs one guided website update:

1. Open First-time setup and double-press the small reset button.
2. Choose its TRINKEYBOOT / TRRSBOOT drive. The site checks the exact TRRS board ID and reads a complete CURRENT.UF2 recovery image. It checks the application startup header as well as the complete image, then saves it in IndexedDB before writing anything.
3. The site verifies its bundled CircuitPython image, prepares the application flash and clean filesystem, and writes the update. The protected bootloader is excluded.
4. When CIRCUITPY appears, choose it with Finish setup. The site checks the board/version, installs the compiled modules and startup files, and reads every file back.
5. Eject, unplug/reconnect, and click Connect. The handshake and settings read confirm that setup is running.

The user never downloads or drags firmware files. Browser drive selections and permission prompts are unavoidable. Keep only one Trinkey connected throughout this flow. Setup replaces existing application software/files/settings and starts with Space/Enter; the complete original flash image is retained for recovery.

Already prepared units go straight to Connect. A future production batch can be prepared with configurator software before distribution to avoid the initial update for customers.

An existing CircuitPython 10.x unit can use the advanced safe-mode file-only installer without replacing its base firmware. The main bootloader flow also supports repair.

## Bindings and recovery

Choose a keyboard key, modifiers, or left/right/middle mouse button for each switch. Save writes both bindings, receives an acknowledgement after persistent read-back, and independently reads settings again. Restore defaults stages Space/Enter; Save applies them. Held keys and mouse buttons are preserved, and mouse actions use the current pointer position.

The three progress steps link to their sections. After saving, step 03 stays active. The switch test suppresses normal HID output and reports physical presses/releases. Once both switches have been pressed and released, the page automatically ends test mode, waits for acknowledgement, and shows All set with step 03 marked Complete. Test again starts a fresh test; changing bindings clears the previous completion result. A heartbeat expires after six seconds if the browser disappears. Closing a connection ends the test. Both switches must be released before normal output re-arms.

Recovery options inside setup can write a saved original firmware copy back through the BOOT drive. Restoration excludes the bootloader and must be checked after reconnecting. A transfer interrupted by the drive disappearing is described as unconfirmed until the next stage/device check. The file-only installer has separate startup-file recovery.

Copies are local to this browser and origin (scheme/host/port). Clearing browser data or moving from localhost to GitHub Pages does not transfer them. Optional recovery ZIP downloads are available after setup. Select the recovery copy for the intended unit when multiple copies exist.

## Device implementation

Target: Adafruit TRRS Trinkey M0 / SAMD21E18A, CircuitPython 10.x; base image 10.0.3. Normal USB exposes keyboard, mouse, and one dedicated data port; console, MIDI, and mass storage are disabled. Safe mode bypasses boot.py.

The small CircuitPython build lacks str.encode(), bytes.decode(), bytes.hex(), and bytearray item deletion. The runtime uses supported constructors, formatting, and slicing. Precompiled .mpy modules avoid the source compiler's memory peak on the board. A startup-failure handler releases HID outputs and reports a bounded ERR STARTUP response through the settings port; it does not expose a Python console.

Source remains in firmware/narbe_config.py and firmware/narbe_runtime.py. These compile to narbe_settings.mpy and narbe_device.mpy. The installed payload also includes boot.py and code.py. Old 0.1.0 source bundles are historical and should not be installed on a new unit.

The original TIP / RING_2 ground and Ring 1 versus Sleeve autodetection are retained, with an explicit contact override available. Physical switch/socket correspondence still requires hands-on validation.

Serial uses 115200 baud, DTR asserted, bounded ASCII newline frames: id COMMAND; id OK payload or id ERR reason. HELLO, GET, SET, RESET, TEST, and PING are supported. Browser pairing only grants port access; Connected requires a successful handshake and settings read. One previously authorized TRRS port is reused; multiple ports require a selection. Bootloader and unrelated board ports are excluded.

NVM bytes 0..15 store versioned settings with a checksum. Saving changed settings uses one NVM assignment and read-back. Corrupt data falls back to defaults. Writes are not power-failure atomic; unplugging during a save can lose settings.

## Build and verification

Run npm test for mapping, Web Serial, installer, backup, and UF2 validation tests. Run python -B tests/test_firmware.py for firmware behavior with simulated hardware.

The checked-in compiled modules and their source/output hashes are recorded in firmware/compiled.json. npm run package refuses stale compiled modules. After editing firmware source, use the official CircuitPython 10.0.3 mpy-cross compiler:

    node scripts/package.mjs --compiler PATH_TO_MPY_CROSS

This creates the 0.2.0 manifest and developer recovery ZIP. Previously released ZIP versions remain unchanged. The compiler is a developer tool; it is not served to customers.

Physical validation on 2026-10-24 backed up the original TinyUSB firmware, prepared CircuitPython using the shared UF2 code, installed/read back the payload using the shared installer code, and verified HELLO, GET, Tab + left mouse SET/read-back, reconnect/read-back, TEST/PING/TEST end, and RESET to Space/Enter. Tab + left mouse were also saved through Chrome, survived a user-performed unplug/replug, and both physical switches produced press/release events. The complete browser flow was also exercised: real folder permission for TRINKEYBOOT, successful automatic UF2 transfer, CIRCUITPY detection, and browser installation/read-back of all four payload files. The final user-performed eject/unplug/replug connected successfully in Chrome with Space/Enter defaults. This unit was updated for testing.

Real key/click/drag behavior in a separate application remains a hands-on acceptance check. The browser file-write API may report a disconnect when a UF2 drive reboots; the UI requires proceeding to the next verified stage rather than claiming the flash was verified.

## Recovery test incident

The initial diagnostic procedure used a 1200-baud software reset on the old TinyUSB application. Its SAMD21 reset implementation erased the first application flash page before the backup was read. The captured file had every UF2 block but was not bootable, so attempting restoration returned to the bootloader. That exact original TinyUSB application cannot be restored from this copy. The user was informed and the unit was returned to working configurator firmware.

The invalid image is retained only for diagnostics as original-device-NOT-RESTORABLE.uf2 under WEBSITES/tmp/trinkey-before-legacy-setup-20261024. A later physical double-reset preserved the working application header; working-configurator-0.2.0.uf2 is a validated recovery image. Customer instructions use physical reset only, and the installer now refuses erased/invalid application vectors before any update. Do not substitute a 1200-baud reset in this workflow. The supplied original CircuitPython Space/Enter profile remains available separately; it is not the exact old TinyUSB firmware.

## Sources and licensing

- [Adafruit TRRS Trinkey](https://www.adafruit.com/product/5954)
- [Board documentation and bootloader reset](https://learn.adafruit.com/adafruit-trrs-trinkey/install-circuitpython)
- [CircuitPython firmware and source](https://circuitpython.org/board/adafruit_trrs_trinkey_m0/)
- [CircuitPython precompiled libraries](https://circuitpython.org/libraries)
- [Official cross-compiler builds](https://adafruit-circuit-python.s3.amazonaws.com/index.html?prefix=bin/mpy-cross/)
- [Web Serial](https://developer.chrome.com/docs/capabilities/serial)
- [CircuitPython license](firmware/CIRCUITPYTHON-LICENSE.txt)
- [Artwork source and prompt](ASSET-NOTES.md)

The base UF2 was supplied in the user's TRINKEY Updater profile; its board/version strings and flash layout were verified. Its SHA-256 is pinned in firmware/manifest.json. The matching official cross-compiler provenance is recorded in compiled.json.
