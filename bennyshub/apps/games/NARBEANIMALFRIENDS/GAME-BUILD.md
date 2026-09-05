# NARBE Animal Friends

**Build specification. This is the only document in this folder.**

Accessibility rules for the hub live in the hub's own `ACCESSIBILITY.md`. This
file does not restate them. It describes what this game *is*, how it is built,
and the decisions that are already made.

Target location: `games/narbeanimalfriends/`

---

## 1. The game in one line

A colourful barnyard where you press a switch, the barn doors swing open, a
shaft of sunlight cuts into the dark, and an animal steps out to say hello.

Then it goes back in, the doors close, and you can do it again.

That is the whole game. It is a peekaboo loop, and everything in this document
exists to make that loop feel good enough that a child wants to press the switch
again.

---

## 2. Who it is for

**This is a visual game.** It is built for children who see, and it should look
like a game those children would choose. Bright, glossy, animated, modern. The
hub is short on games that look genuinely fun, and that is the gap this fills.
Make it good first, then make it adjustable.

Three audiences, in priority order:

1. **A sighted child, or an adult with an intellectual disability, using one or
   two switches.** The design centre. Everything defaults to their experience.
2. **A player with low vision or CVI.** Served by settings, not by defaults.
   The preset ladder in section 9 strips the scene down to high contrast and
   finally to a flat, uncluttered render. A real option, not a compromised
   default.
3. **A blind player using switches.** Served by the audio contract in section 8.
   Not a courtesy: the game must be completable with the monitor off, because
   that is also what makes it work for the player whose vision fluctuates and
   for the player who is not looking at the screen right now.

Nobody in that list gets talked to like a baby. Language register is a setting
(section 10), so an adult playing the same cause and effect game can turn the
sing-song off.

---

## 3. Rendering: 2D cutouts in a 3D scene

**Three.js stage, flat PNG cutouts, DOM interface on top.**

This is a deliberate technique, not a compromise. Paper Mario, Don't Starve and
Octopath Traveler are all built this way. Flat art placed in a real 3D scene
picks up real perspective, real lights and real shadows, which is what makes
generated stills look intentional rather than pasted.

The alternative was pure 2D, and it was rejected for one reason: **ComfyUI gives
you stills.** Stills in a 3D scene read as art direction. Stills in a 2D scene
read as a web page, however nicely you animate them.

### What the 3D actually buys

Each of these is hard or impossible to fake convincingly in CSS, and together
they are the entire look of the game:

- **A shaft of sunlight from the open barn door**, with dust motes drifting in
  it. The most striking single thing in the reveal.
- **A real cast shadow shaped like the animal.** Three.js casts shadows from a
  cutout's alpha channel, so the cow's shadow is cow-shaped on the barn floor.
  Nearly free once configured, and it is the thing that stops a flat image
  reading as a sticker.
- **A slow dolly-in as the animal emerges**, with background layers parallaxing
  at different rates because they are at different depths.
- **Warm rim light** on the animal's edge as it steps into the sun.
- **Depth of field** softening the barn interior behind it.

### The decision that makes it work: fix the camera

The failure mode of cutout 3D is the cardboard standee. It happens when sprites
billboard toward a moving camera and the player catches them turning.

**So the camera is fixed.** A gentle dolly on the Z axis and a very slight idle
drift, nothing more. No orbit, no rotation around anything, ever. At this art
style a flat plane then becomes indistinguishable from a modeled object.

That is also the accessible choice by coincidence: no camera control means no
third input, which `ACCESSIBILITY.md` §2 forbids anyway.

### Architecture: WebGL stage, DOM interface

**The canvas is the stage only.** Every menu, setting, choice button, stamp,
scan highlight and piece of text stays in the DOM, layered on top.

This is not negotiable, for three reasons:

1. The scan highlight is a real CSS outline you can prove is correct, rather
   than something reimplemented in WebGL and quietly wrong.
2. Focus, TTS and the whole input contract stay in the layer where they are
   testable.
3. The entire accessibility surface stays inspectable in devtools.

**It also gives you the Simple preset for free.** The CVI preset becomes "do not
initialise WebGL at all" and runs as pure DOM. That is the strongest possible
guarantee that Simple has no leftover effects, and the same code path doubles as
the fallback when WebGL is unavailable or the device is too weak. One renderer
swap solves two problems.

### Keeping the Three.js surface small

Everything this game needs from Three.js:

- `TextureLoader`, `PlaneGeometry`, `MeshBasicMaterial` and `MeshStandardMaterial`
- One directional light, one ambient, one shadow map
- A cone or a shader plane for the light shaft, and a `Points` cloud for dust

No `GLTFLoader`. No model format. No animation system. No physics. No
`OrbitControls`. If a task seems to need one of those, it is probably the wrong
task.

**Version: match whatever the hub already ships.** Do not add a second copy at a
different version and do not load from a CDN, because the hub runs offline in
the Electron build. Vendor the file locally.

### The two WebGL traps, retired by construction

`ACCESSIBILITY.md` §11 records both, and they cost this hub real debugging time
on Show n Sound:

- **Self-hosted SVGs blank out in WebGL without explicit `width` and `height`.**
  This game uses no SVG textures. All stage art is PNG. UI SVGs live in the DOM
  layer where the trap does not apply.
- **Cross-origin images without CORS headers blank out in WebGL.** All assets
  are same-origin. No CDN-hosted art, ever.

Both are avoided by rule rather than by remembering, which is the only way this
kind of trap stays avoided.

### Non-negotiable, and easy to break

Sound goes through the hub's `SafeAudio`. **No `AudioContext`, no Web Audio API,
ever**, because it can take down the renderer in the Electron desktop build.
**That includes `THREE.AudioListener` and `THREE.PositionalAudio`**, which are
Web Audio underneath. It would be very easy to reach for them without noticing.

No true positional audio, therefore. Fake the depth with volume, and with a
pre-baked muffled "inside the barn" variant of each clip. Baking it into the
asset is free at runtime; doing it with a filter node is not allowed.

Use the hub's shared modules and never keep a private copy of their state:
`NarbeScanManager`, `NarbeVoiceManager`, `SafeAudio`.

---

## 4. The scene, layer by layer

Everything is a flat plane at a fixed Z. Nothing rotates.

| Layer | Z | Contents |
| --- | --- | --- |
| Sky | -40 | Gradient plane, sun glow, two slow clouds |
| Hills | -30 | One or two silhouette bands |
| Barn front | -8 | The barn facade with the door opening cut out |
| Doors | -8 | Two planes, hinged at their outer edges, swinging on `rotation.y` |
| Barn interior back wall | -20 | Dark, with hay bales and a lantern |
| Floor | ground | A plane laid flat, running from the interior out to the yard |
| **Animal** | -14 to -6 | Moves forward on Z during the reveal |
| Light shaft | -12 | Additive cone from the doorway, plus a dust `Points` cloud |
| Foreground grass | +4 | A thin band at the bottom, slightly out of focus |

The dolly moves the camera from about Z 12 to Z 9 during the reveal. The
parallax between those layers is what sells the depth, and it costs nothing.

**Lighting.** One warm directional sun, low and side-on so everything has a long
shadow, plus a soft sky ambient. The animal casts a shadow. The doors cast
shadows across the floor as they swing. That single moving shadow does more for
the feel than any texture will.

---

## 5. The asset pipeline

This is what lets the game be built now and look good later.

**Three tiers, and the code never knows which one it is running.**

| Tier | Art | Audio | Status |
| --- | --- | --- | --- |
| **0. Placeholder** | Emoji, rendered to a canvas and used as a texture | TTS speaking the sound ("Moo!") | Build against this |
| **1. Generated** | ComfyUI PNGs | TTS or scratch recordings | Next |
| **2. Final** | ComfyUI PNGs, reviewed | Recorded audio | Ship |

### The rule that makes this work

**Everything about an animal lives in one registry entry, and nothing else in
the codebase knows an animal by name.** The choice rows, the random pool, the
"just one animal" picker, the stamp board and the spoken lines all read from the
registry.

```js
// js/animals.js
const ANIMALS = [
  {
    id:    'cow',
    name:  'Cow',
    says:  'Moo',
    emoji: '🐮',                              // tier 0
    art: {                                    // tier 1 and 2, null until they exist
      idle:  'art/cow-idle.png',
      call:  'art/cow-call.png',
      happy: 'art/cow-happy.png'
    },
    sounds: {
      call: 'sounds/cow.wav',                 // tier 2, null until it exists
      soft: 'sounds/cow-soft.wav',
      muffled: 'sounds/cow-muffled.wav'       // played while still inside the barn
    },
    scale: 1.0                                // per-animal size trim, duck is smaller than horse
  },
  // ...
];
```

The texture loader asks for the best available art and falls back down the tiers
on its own. **Tier 0 renders the emoji to an offscreen canvas at the same pixel
dimensions the real PNG will be, then uploads that as a texture.** The plane, the
alpha shadow, the lighting and the layout are therefore identical on day one and
on shipping day. Nothing shifts when the art lands.

**Upgrading the whole game to real art is dropping PNGs into `art/` and filling
in one field per animal.** No other code changes. If that is not true, the
abstraction is broken and it is worth fixing before adding features.

### Tier 0: emoji placeholders

| Animal | Emoji | Says |
| --- | --- | --- |
| Cow | 🐮 | Moo |
| Pig | 🐷 | Oink |
| Goat | 🐐 | Maaa |
| Sheep | 🐑 | Baaa |
| Horse | 🐴 | Neigh |
| Duck | 🦆 | Quack |
| Rooster | 🐓 | Cock a doodle doo |
| Dog | 🐶 | Woof |

**Emoji must not ship.** They render differently on every platform, some have no
face-forward variant, and the set will not look like one family of animals. They
are scaffolding. Add a console warning on boot listing which animals are still
on tier 0, so nobody ships by accident.

### Tier 1 and 2: the ComfyUI brief

Per animal, generate **three poses**:

| Pose | What it shows | Used in |
| --- | --- | --- |
| `idle` | Neutral, facing the viewer, friendly | Standing in the doorway, choice buttons, stamps |
| `call` | Mouth open, making its sound, head lifted | The moment the sound plays |
| `happy` | Excited, celebrating | Row complete, correct find |

Optional fourth: `walk`, three-quarter view, for the walk-out.

**The art must be generated *for* this pipeline, or the lighting will fight
itself.** Three requirements that belong in the prompt, not in post:

1. **Bake the light from one fixed direction**, and match the scene's sun to it.
   Flat unlit art lit by a 3D light looks wrong. Art with baked light from the
   wrong side looks worse.
2. **Fixed slightly low camera angle**, matching the game camera. If the art
   looks down at the animal and the camera looks up, the illusion dies.
3. **Clean alpha edges, no soft halo fringing.** The cast shadow is derived from
   the alpha channel, so a fuzzy edge becomes a fuzzy shadow.

Output format:

- **Transparent PNG.** The animal sits in a lit barn interior, not on its own
  background.
- **Square canvas, 1024x1024**, animal centred, consistent margin. Same framing
  every time so a cow and a duck do not need different geometry.
- Ship a **512x512** version too and serve that by default.
- Filenames `art/<id>-<pose>.png`, lowercase, hyphenated, matching the registry
  `id` exactly.

**The real risk with generated art is inconsistency, not quality.** Eight animals
that each look good but do not look like a set will read as worse than eight
mediocre animals that match. So:

- **One prompt template, one style anchor, one batch.** Fix the style, lighting
  direction, line weight, palette and camera angle in the template and change
  only the animal.
- **Regenerate the whole set, never patch one animal.** If the pig needs redoing,
  redo all eight from the updated template.
- Keep the working prompt, seed, model and any LoRA in `art/PROMPT.txt` next to
  the images. Six months from now, adding a ninth animal that matches depends
  entirely on that file existing.

Style direction: chunky, rounded, saturated, soft cel shading with a clear dark
outline. Modern children's game, not photorealism. **The outline is not
decorative:** it is what keeps the animal readable for a low vision player and
against the dark barn interior, so treat it as a requirement of the brief.

### Audio assets

Recorded, one per animal, named by animal id:

```
sounds/cow.wav           the normal call
sounds/cow-soft.wav      a gentler version (see section 8)
sounds/cow-muffled.wav   heard through the closed doors (optional, nice)
```

Until they exist, the game speaks the onomatopoeia through `NarbeVoiceManager`.
**That fallback stays in the shipped game permanently**, because it is also what
covers a failed load.

Recording notes: one to two seconds, mono, 44.1kHz WAV. **Consistent loudness
across all eight**, so a player does not get a soft cow and a jarring rooster.
No sudden attack at the start.

---

## 6. The loop, beat by beat

Timings are defaults; several are settings. Everything works at tier 0 and gets
better with real art.

| Beat | What happens | Timing |
| --- | --- | --- |
| **0. Press** | Latch clunk. The barn nudges. Fires at zero delay, always, before anything else. | 0ms |
| **1. Wait and wonder** | Doors shake in the frame. A thin line of warm light appears at the seam and pulses. A muffled animal sound from inside. A four note tune rises. | 0 to 900ms |
| **2. Doors swing** | Both doors rotate outward on their hinges with a wooden creak. The light shaft opens up and the dust motes catch it. Their shadows sweep across the floor. | 900 to 2000ms |
| **3. Come out** | The animal moves forward on Z from the dark interior into the shaft, growing with real perspective, its alpha shadow lengthening behind it. Camera dollies in slightly. | 2000 to 3000ms |
| **4. The call** | Swap to the `call` texture, play the sound, small squash and bounce. Swap back to `idle` when it finishes. | 3000 to 3800ms |
| **5. Name it** | "It's a cow! The cow says moo." A soft light bloom. | 3800ms |
| **6. Looking time** | The animal idles: slow bob, slight rotation on Z, shadow shrinking as it rises. Alive on screen, not a pasted sticker. | 4500ms default, a setting |
| **7. Back inside** | Moves back on Z into the dark. Doors swing shut with a thump. The shaft closes. | ~2000ms |

Pressing at any point during 1 to 7 cuts it short and starts a fresh reveal.
**Never block input during the animation.** A child hammering the switch should
get a fast, slightly chaotic barn, not a frozen one.

**The rule that governs all of it:** nothing new goes between the press and the
first sound. The player must never wonder whether the press registered.

### Making three stills feel alive

The life comes from motion and light, not from frame count:

- **Idle:** slow bob on Y with a degree or two of Z rotation, phase-offset per
  animal so two animals on screen are never in sync.
- **Arrival:** Z movement and scale together with an overshoot curve, plus a
  squash on landing.
- **The call:** texture swap plus a quick scale pop timed to the sound's attack.
- **Shadow:** derived from alpha, shrinking as the animal rises on the bob. One
  of the cheapest things you can do and one of the most convincing.

---

## 7. Modes

| Mode | What it is |
| --- | --- |
| **Open the Barn** | Press, a random animal comes out. Pure cause and effect. Default mode. |
| **Pick an Animal** | Scan a row of animals, choose one, that one comes out. |
| **Listen and Find** | Hear an animal, then find it. **No fail state.** A wrong pick names what they chose, plays that animal's sound, and points back to the target. The number of choices on screen is a setting from 1 to 4, so a caregiver can start errorless and add difficulty. |

No score, no timer, no losing, in any mode.

**The barnyard board.** Five stamp slots along the top in the DOM layer, newest
first, empty slots showing as outlines so there is always something visibly left
to fill. Filling all five triggers a celebration and a fresh row. That is the
closure an endless loop cannot give a child.

---

## 8. Audio, and the blind-playable contract

**Every visual event has a distinct sound.** If something happens on screen and
nothing happens in the speakers, that is a bug.

| Event | Sound |
| --- | --- |
| Press registered | Latch clunk, instant |
| Anticipation | Door rattle, muffled animal call, rising four note tune |
| Doors opening | Wooden creak |
| Animal arriving | Soft landing thump, footsteps |
| The call | The animal's own sound |
| Naming | Speech |
| Doors closing | Thump and latch |
| Stamp earned | Stamp thunk |
| Row complete | Fanfare |
| Scan step | Soft blip |
| Selection | Confirm tone |

**The acceptance test: turn the monitor off and play a full round of Listen and
Find.** If you cannot tell what is happening, what you selected, or whether you
found the animal, the audio is not finished. Run this before shipping.

Ship a **gentle set** alongside the normal set with a setting to switch. A
sudden loud animal can startle a player badly enough that they stop pressing the
switch, which ends the game for them entirely.

**The `SafeAudio` trap, from `ACCESSIBILITY.md` §11:** `preload(name, url)`
caches the entry on the first call, so pointing a built-in sound name at a URL
that 404s permanently shadows the synthesised sound, with no console error. Use
your own names for animal calls, never a built-in one, and if you want a
built-in, pass no URL at all.

Every sound fails gracefully: a missing file logs to the console naming the file
it wanted, and the voice speaks the sound instead. Never a silent failure.

---

## 9. Visual presets: the low vision and CVI path

Four presets. The first three are the same WebGL scene with things turned off.
**The fourth does not start WebGL at all.**

| Preset | What it is |
| --- | --- |
| **Full farm** *(default)* | Everything. Sky, hills, clouds, light shaft, dust, shadows, depth of field, dolly, parallax. |
| **Bright** | Sky flattened to a plain gradient. Hills, clouds and foreground grass removed. Depth of field off, dust off. Saturation up, animal outline thickened. Light shaft and shadows kept. |
| **High contrast** | Background to solid black. All scene dressing gone. The animal on a plain lit patch, one strong key light plus a rim light, no texture on anything else. Highlight thickness doubled. Camera dolly off. |
| **Simple** | **No WebGL.** DOM only: a doorway, two doors, one animal, one dark field. No shadows, no shaft, no dust, no parallax, no camera. The minimum on screen at once. |

Three things must be true, worth checking explicitly at review:

- **Simple is a different renderer, not the scene turned down.** That is the
  point of building it this way, and it is the only way to guarantee there is no
  leftover gradient, bloom or gloss.
- **Simple doubles as the fallback.** If WebGL fails to initialise or the device
  is too weak, the game drops to the Simple renderer and keeps working rather
  than showing a black canvas.
- **Movement stays in every preset.** Motion is often the most reliably
  preserved visual channel when object recognition is impaired, so the animal
  keeps its idle bob even in Simple. It is clutter that gets removed, not life.

Default is **Full farm**. This is a game for children who see. The presets are a
complete route out, reachable in three selections from the pause menu.

---

## 10. Settings

Too many for one scan list, so game-specific options go behind four short pages,
in the slot the hub's settings convention reserves for them. Root keeps the
hub's canonical order.

**Root:** Text to Speech, Voice, Talking, Playing, Looking, Sounds, Auto Scan,
Scan Speed, Sound Effects, Reset Progress, Back

**Talking** — Words (A few words / Short sentences / Full sentences), Style
(Playful / Plain), Grown Up Prompts, Player Name

**Playing** — Animals in the Barn (All / Four / Just one), Just One Is, Choices
to Find (1 to 4), Wait and Wonder, Looking Time, Door Speed, Celebrate a Full
Row, Pause Button

**Looking** — Visual Preset, Animal Appears (Middle / Left / Right), Animal
Moves (Lively / Gentle / Still), Highlight Colour, Highlight Style

**Sounds** — Volume, Gentle Sounds, Barn Song, Animal Sound (once or twice)

Keep each page under about nine items; split rather than let one grow. Every
option should speak what it *means*, not its value: choosing a Words level
should read back an example line in that level so a caregiver hears the change.

---

## 11. File layout

```
games/narbeanimalfriends/
  README.md            this file
  index.html           loads shared modules first, then the game
  css/
    style.css          the DOM interface layer
  js/
    main.js            boot, screen state, hub messaging, renderer selection
    animals.js         the registry, and the art/sound tier fallback
    stage3d.js         Three.js scene, layers, lights, shaft, dust, dolly
    stage2d.js         the DOM-only renderer used by the Simple preset
    reveal.js          the beat-by-beat sequence in section 6, renderer-agnostic
    ui.js              menus, settings pages, stamp board, pause. DOM only
    input.js           switch handling, scan list, hold gestures
    audio.js           SafeAudio wrapper, barn song, animal calls
    settings.js        defaults, persistence, presets
  art/
    PROMPT.txt         the ComfyUI template, seed, model. Do not lose this
    cow-idle.png  cow-call.png  cow-happy.png
    ...
    barn/              facade, doors, interior, hay, lantern
    scene/             sky, hills, clouds, grass
  sounds/
  vendor/
    three.min.js       vendored, version matched to the hub
```

**`reveal.js` must not import Three.js.** It drives the loop by calling methods
that both `stage3d.js` and `stage2d.js` implement: `openDoors()`, `bringOut()`,
`setPose()`, `putAway()`, `closeDoors()`. That interface is what keeps the
Simple preset honest and keeps the two renderers from drifting apart.

---

## 12. The editor

`ACCESSIBILITY.md` §1 asks every new game to consider an editor early and calls
it the highest-leverage accessibility feature in the hub. This game is unusually
well suited, and the registry in section 5 already has the right shape: a
caregiver builds a pack of family photos, their own recorded voices, their own
animals and names. One game becomes one game per player, tuned by the person who
actually knows them.

A family photo is a flat cutout too, which is exactly what this renderer already
draws. A user-supplied photo needs background removal or it arrives as a
rectangle, so either do that in the editor or accept rectangles and frame them.

Not required for v1, but do not design the registry in a way that blocks it. A
pack is a list of the same objects under its own `localStorage` key rather than
mixed into game settings. The built-in eight stay as the default pack and cannot
be deleted.

Like every editor in the hub it will be mouse and keyboard only, which makes the
way *in* to it dangerous. **It must sit behind the spoken warning dialog from
`ACCESSIBILITY.md` §7.** Cancel first in the scan order, scan trapped in the
dialog, spoken the moment it opens, and it must name what the player loses ("you
will not be able to scan and select with your switch"), not what the feature is.
That pattern is not optional.

---

## 13. Performance and persistence

Target device is a tablet, so budget for one, not for a desktop GPU.

- **60fps on an iPad** on Full farm with an animal animating.
- Fewer than twenty draw calls for the whole scene. Every layer is one plane.
- One shadow map at 1024, with only the animal and the doors casting.
- Textures at 1024 or smaller. Serve 512 art by default.
- Preload the barn, the scene and the first animal. Fetch the rest in the
  background. **Nothing blocks the first press.**
- Keep total art under a couple of megabytes if you can. Families play on
  ordinary connections.
- If the frame rate drops on the target tablet, cut layers and effects, not
  render resolution.

Persistence is `localStorage`, saved as it happens, so a player who tires
mid-session comes back to where they were. Access settings belong to the shared
managers; read them, do not copy them. Game settings and progress go under this
game's own key. Reset Progress is two-step: it arms on the first select and only
erases on a second deliberate one.

---

## 14. Hub integration

- Add the entry to the hub's games manifest with a thumbnail and genres, using
  the `games/narbeanimalfriends/` path. Check the genre strings against the
  existing vocabulary.
- `index.html` loads the shared modules before any game script, in the hub's
  required order.
- Exit Game must send
  `window.parent.postMessage({ action: 'focusBackButton' }, '*')`. Without it the
  player reaches the end and is stranded with focus nowhere.
- Settings reachable from both the main menu and the pause menu.

Input, scanning, hold gestures and the pause contract are the hub's, not this
game's. Follow `ACCESSIBILITY.md` and do not invent a variation here.

---

## 15. Build order

Ship something playable early, then make it beautiful.

1. **DOM grey box.** Build `stage2d.js` first: barn and doors in CSS, an emoji
   animal, the full loop from section 6, switch input end to end, exit message
   wired. **The loop is fun or it is not, and you find out here, before any
   WebGL and before anyone generates a single image.** This is also the Simple
   preset, finished, so it is not throwaway work.
2. **Audio map.** The full sound table from section 8, TTS standing in for animal
   calls. Run the monitor-off test.
3. **Modes and the stamp board.** Pick an Animal, Listen and Find, celebration.
4. **Settings**, all four pages.
5. **`stage3d.js`, still on emoji textures.** Layers, lights, hinged doors,
   camera dolly, alpha shadow, light shaft, dust. **Do this before the real art
   exists.** If the scene looks good with emoji in it, real art will land into
   something already working. If it does not look good, you find out cheaply.
6. **ComfyUI pass.** All eight animals, three poses, one batch, one template.
   Drop them in `art/`, fill in the registry.
7. **Recording pass.** Real animal sounds, normal and gentle sets.
8. **Polish.** Depth of field, bloom, scene dressing, celebration.

Steps 6 and 7 should be pure asset drops. **If either requires touching game
logic, the tier system in section 5 was built wrong** and it is worth stopping to
fix rather than working around.

### The risk to watch

**Half-committed 2.5D looks worse than clean 2D.** If the light shaft, the alpha
shadow and the dolly do not all land, you have taken on WebGL and a bigger bundle
for a scene that looks like CSS with extra steps.

Step 5 is the checkpoint. If the 3D stage with emoji in it does not already look
better than the DOM version from step 1, stop and say so rather than pushing on
and hoping the art rescues it. `stage2d.js` is a complete, shipping renderer, so
falling back to it costs nothing but the WebGL work.

---

## 16. Where this deviates from ACCESSIBILITY.md, on purpose

Two places. Both deliberate, both worth arguing with rather than copying into the
next game.

**§9 says "high contrast by default". This game defaults to the full farm
scene.** The hub guide is right for a game aimed at Ben and players like him.
This game fills a different gap, which is that the hub is short on games that
look like something a sighted child would pick up by choice. The compromise: the
*interface* still obeys §9 without exception, so the highlight is colour and
thickness, targets are 64px or bigger, spacing is generous, and nothing signals
state by colour alone. It is the stage that is rich, and it lives in a separate
layer from the interface precisely so that stays true.

**§1 says the player "is not a child, and should not be talked to like one".
This game defaults to a playful register.** Because it is built for children, and
a game for children that talks like a manual is a worse game. The guide's point
still stands and is honoured by making register a setting: `Style: Plain` drops
the cheer entirely, and an adult with an intellectual disability gets the same
game, the same access, and no baby talk. If this ever ships with the register
hard-coded, that is a bug.

One place where this spec *follows* the guide against the easier option: §12
asks new games to favour a **scannable** pause entry rather than only a hold,
because holding a switch is itself a physical demand some players cannot meet.
The `Pause Button` setting exists for that, and the guide's honest trade applies
here too: a scannable Pause taxes every press in Open the Barn mode, where the
barn is the only other thing in the scan cycle. Real players should settle the
default.

Every millisecond figure in this document is for the implementer. None go in
front of the player. §4 is explicit: no durations in help text, hints, footers,
or anything spoken.

---

## 17. Done means

- The loop feels good enough that a child presses it again without being asked.
- Playable start to finish with Space and Enter only, and with Enter alone under
  Auto Scan.
- A full round of Listen and Find completed with the monitor off.
- The scan highlight, every menu and every button is in the DOM, not the canvas.
- **Simple preset runs with WebGL never initialised**, and is also what loads
  when WebGL fails.
- **No emoji left in the shipped build**, and the boot-time tier warning is
  silent.
- All eight animals came from one ComfyUI batch and look like one set, lit from
  the same direction as the scene.
- `art/PROMPT.txt` is committed and actually reproduces the set.
- 60fps on the target tablet on Full farm.
- Every sound has a graceful failure path.
- Progress saves and resumes.
- Nothing prints or speaks a duration in seconds to the player.
- Checked at 1024x768, 768x1024 and 844x390.
- **Played start to finish with one switch, by someone who is not you.** That
  last one is the only test that actually counts.
