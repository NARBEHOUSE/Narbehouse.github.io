# Benny's Hub development rules

Read `bennyshub/ACCESSIBILITY.md` and `developer-guide.html` before changing scan behavior. These are the maintained behavior and integration references; `SCAN-UPGRADE-CHANGES.md` records the current implementation and locked Electron plan. User instructions and scope clarifications take precedence.

- Classify every scan with the exact question: **"If Ben stops pressing, does anything in the game keep happening?"** No = CHOICE; yes = MECHANIC.
- Every root CHOICE loop includes recurring -1 in both directions. Step -1 is silent and inert. Auto with Parking Off passes -1 silently; only chosen/auto parking announces park or parked. Auto supports chosen/1–3-loop parking, and parked Enter resumes first without selecting.
- Auto Space Brake freezes on keydown without cancelling label speech. Tap stays paused; second tap or hold release resumes after a full interval. Indicate scan pause only with a dotted outline on the selected choice; do not add Paused text or a Paused badge. Preserve native multiplayer switch ownership and Brake Off behavior.
- The outline-only scan-pause policy applies across Hub, all apps and Companion. Keep Parked feedback and ordinary game/video pause-menu labels; Companion playback/scan status stays inline.
- Wait for Speech uses the owned completion ticket plus a full interval, with the voice manager’s bounded fallback. Input stays available.
- Fresh menus begin blank. Settings/redraws retain stable IDs. Nested Back restores the same parent row/item. Keyboard rows opt into `enterGroup(children, {wrap:true})`: both directions loop within the selected row until selection or Back, without counting root parking loops. Other child loop boundaries exit to root -1. Explicit separate modal returns may start fresh.
- The new Parking/Loops/Brake/Wait settings belong only to Hub Settings, visible-disabled when unavailable, using the existing page scroll. Existing local Auto/voice/speed controls stay.
- Forward matched inputs after the existing 50/100/200/300 ms cooldown/anti-rapid guard. No minimum press length or second activation debounce. Preserve app-owned hold thresholds.
- Preserve gameplay, timing, difficulty, art, defaults and controls. Aim/charge/steering mechanics are excluded. New gameplay alternatives are opt-in work requiring separate scope, not part of a scan conversion.
- Use the shared controller/explicit adapter; supply real context/item identities and status hosts. Do not poll arbitrary DOM lists. Shared logic uses NarbePlatform for storage, speech, input and lifecycle.
- Back up before broad changes. Keep prior release ZIPs immutable. Log every changed file with scope and Electron port flag in SCAN-UPGRADE-CHANGES.md. Test actual nested surfaces and layout, not just page loads.
- Ben’s Electron app is read-only until web verification, user confirmation, and the explicit instruction **"start the Electron pass."** Do not edit, install, launch, or port it as a side effect.
