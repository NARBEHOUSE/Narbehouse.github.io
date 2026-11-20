NARBE Space Explorer: VS Code Build Prompt
Overview
Build a switch-accessible, procedurally generated space exploration game called NARBE Space Explorer for SwitchedGames. The player stays inside their spaceship the whole time and explores a near-infinite universe of galaxies, star systems, planets and moons. It is a calm, exploratory experience designed for players who use one or two accessibility switches, including people who are bedridden and want the feeling of going somewhere new every time they play. There is no combat, no fail state and no timer.
Use HTML, CSS and JavaScript with Three.js for 3D rendering. Keep the project lightweight and self-contained, with no large asset files. Everything visual and audio should be generated in code.
Controls and Accessibility
• Two-switch mode is the default. Switch 1 (Space) moves the highlight to the next option. Switch 2 (Enter) selects the highlighted option.
• Include an optional one-switch auto-scan mode, where the highlight advances on a timer and the single switch selects. The scan speed should be adjustable in settings.
• Every action in the game must be reachable through scanning. No mouse, keyboard combos or fast reactions required.
• Highlights must be large, high contrast and easy to see from a bed or at a distance. Add an optional spoken label for each option using the browser's speech synthesis.
• Key bindings should be remappable in a settings menu.
Core Gameplay Loop
1.  Flying. In free roam, the ship flies forward on its own at an accelerated, not-to-scale pace. The scan menu offers steering options such as Turn Left, Turn Right, Up, Down, Speed Up and Slow Down.
2.  Discovering. When the ship comes near a planet, moon, star or other object, a large prompt appears: "Do you want to go here?" with Yes and No. Yes flies the ship into orbit automatically. No lets the player keep flying.
3.  Orbiting. In orbit, the scan menu offers Fly Low (skim over the surface), Scan (look closer at creatures or features), Visit a Moon, Switch View, and Leave Orbit.
4.  Warping. A Warp option on the galaxy map sends the player to a random new galaxy or star system with a satisfying jump effect. It should feel like one big, exciting press.
Cockpit Views
Provide two or three viewpoints the player can cycle through with a Switch View option:
• Cockpit window view, with a simple ship dashboard frame around the screen.
• Outside chase view, showing the ship against space or the planet.
• Wide panoramic view for sightseeing.
Procedural Universe
Everything is generated from seeds, so nothing needs to be stored. The same seed must always produce the same result, so a planet looks the same every time it is visited.
• Galaxies contain many star systems. Each system can have one or multiple stars.
• Stars vary in type: yellow suns, red dwarfs, blue giants, white dwarfs, binary pairs, and rare special objects like nebulae or black holes.
• Planets vary widely: ice worlds, ocean worlds, earth-like worlds, desert worlds, lava worlds, crystal worlds, toxic worlds, and gas giants with bands and rings.
• Moons: each planet's seed decides how many moons it has, from none to several. Moons can be visited like planets.
• Planet properties such as colour palette, terrain shape, atmosphere, clouds, rings and gravity (shown as a fun stat in the logbook) all come from the seed.
Names
Generate names from syllable lists (for example "ka", "thor", "vel", "ix", "ara"), joining two or three syllables per name so they sound alien and pronounceable. Moons take their planet's name with a numeral, such as "Velara II". Names must stay the same for the same seed.
Creatures
Build creatures out of parts so the variety is huge and wacky. The seed picks a body shape, number of legs or tentacles, eyes, colours, size and how it moves (hopping, drifting, crawling, floating). Creatures are visible in the Fly Low view wandering the surface, and the Scan option shows one up close in a viewer window with its generated name.
Alien Civilizations
Some planets host civilizations. Show signs of them, such as city lights on the night side or ships that fly up to meet you. Occasionally an alien hails the player: an alien face pops up on screen and speaks generated gibberish using browser speech synthesis with altered pitch and rate. Aliens can be friendly, curious, grumpy, or loud, sometimes yelling things like "GO AWAY" in alien. Keep it funny and never scary.
Logbook
Keep a logbook of everything the player has visited, saved in localStorage. Each entry records the name, type, a snapshot image, key stats like gravity and number of moons, and any creatures scanned. The logbook should be easy to browse with switches so a carer or family member can look through the journey together with the player.
Audio
Generate calm ambient space music and sound effects in code with the Web Audio API. Each star type can have its own ambient tone. Include a warp sound, a discovery chime for the "Do you want to go here?" prompt, and alien voice effects.
First Version Scope
Start small and get the feel right before expanding:
1.  One galaxy with seeded star systems, flying, and the go-here prompt.
2.  A handful of planet types plus gas giants, moons and generated names.
3.  Orbit, Fly Low, and the cockpit views.
4.  The logbook.
5.  Then add creatures, civilizations and warping between galaxies.
Test every screen using only switches before moving on to the next step.