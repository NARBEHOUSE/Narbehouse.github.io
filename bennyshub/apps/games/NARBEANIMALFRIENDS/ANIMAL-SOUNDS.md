# Animal sound recording list

Every animal in NARBE Animal Friends, generated from the rosters in
`js/zones.js` - regenerate rather than editing by hand if the rosters change.

- **id** is what the file must be named after. It is the animal's key
  everywhere in the code, so `sounds/animals/<id>.wav` needs no lookup table.
- **Says** is the word the game speaks for an animal that has no recording
  yet. It is what a recording replaces, so it doubles as a hint for the sound
  to make.

**This is live.** Drop `<id>.wav` into `sounds/animals/` and that animal uses
it on the next launch - no code change, no list to update. Files are WAV, to
match every other sound in the game.

An animal with a recording plays it as it comes out of the door, and its sound
word is then NOT spoken - the recording is that sound, and saying it as well
would be the same thing twice. An animal with no recording keeps the spoken
word exactly as now, so a half-filled folder plays as a whole game. The spoken
FACT after it is unaffected either way.

## Barn  (20 animals)

| # | Animal | id | Says | File to record |
|---|--------|----|------|----------------|
| 1 | Cow | `cow` | Moo | `sounds/animals/cow.wav` |
| 2 | Pig | `pig` | Oink | `sounds/animals/pig.wav` |
| 3 | Goat | `goat` | Maaa | `sounds/animals/goat.wav` |
| 4 | Sheep | `sheep` | Baaa | `sounds/animals/sheep.wav` |
| 5 | Horse | `horse` | Neigh | `sounds/animals/horse.wav` |
| 6 | Duck | `duck` | Quack | `sounds/animals/duck.wav` |
| 7 | Rooster | `rooster` | Cock a doodle doo | `sounds/animals/rooster.wav` |
| 8 | Dog | `dog` | Woof | `sounds/animals/dog.wav` |
| 9 | Cat | `cat` | Meow | `sounds/animals/cat.wav` |
| 10 | Owl | `owl` | Hoot | `sounds/animals/owl.wav` |
| 11 | Turkey | `turkey` | Gobble | `sounds/animals/turkey.wav` |
| 12 | Bull | `bull` | Snort | `sounds/animals/bull.wav` |
| 13 | Llama | `llama` | Hum | `sounds/animals/llama.wav` |
| 14 | Rabbit | `rabbit` | Thump | `sounds/animals/rabbit.wav` |
| 15 | Mouse | `mouse` | Squeak | `sounds/animals/mouse.wav` |
| 16 | Bee | `bee` | Buzz | `sounds/animals/bee.wav` |
| 17 | Frog | `frog` | Ribbit | `sounds/animals/frog.wav` |
| 18 | Butterfly | `butterfly` | Flutter | `sounds/animals/butterfly.wav` |
| 19 | Hedgehog | `hedgehog` | Snuffle | `sounds/animals/hedgehog.wav` |
| 20 | Squirrel | `squirrel` | Chatter | `sounds/animals/squirrel.wav` |

## Aquarium  (20 animals)

| # | Animal | id | Says | File to record |
|---|--------|----|------|----------------|
| 1 | Fish | `fish` | Blub | `sounds/animals/fish.wav` |
| 2 | Tropical Fish | `tropicalfish` | Bloop | `sounds/animals/tropicalfish.wav` |
| 3 | Blowfish | `blowfish` | Puff | `sounds/animals/blowfish.wav` |
| 4 | Shark | `shark` | Chomp | `sounds/animals/shark.wav` |
| 5 | Octopus | `octopus` | Squish | `sounds/animals/octopus.wav` |
| 6 | Squid | `squid` | Swoosh | `sounds/animals/squid.wav` |
| 7 | Crab | `crab` | Snip | `sounds/animals/crab.wav` |
| 8 | Lobster | `lobster` | Click | `sounds/animals/lobster.wav` |
| 9 | Shrimp | `shrimp` | Flick | `sounds/animals/shrimp.wav` |
| 10 | Dolphin | `dolphin` | Eee eee | `sounds/animals/dolphin.wav` |
| 11 | Orca | `whale` | Whoooo | `sounds/animals/whale.wav` |
| 12 | Big Whale | `bigwhale` | Splash | `sounds/animals/bigwhale.wav` |
| 13 | Seal | `seal` | Arf arf | `sounds/animals/seal.wav` |
| 14 | Penguin | `penguin` | Squawk | `sounds/animals/penguin.wav` |
| 15 | Turtle | `turtle` | Splish | `sounds/animals/turtle.wav` |
| 16 | Otter | `otter` | Chirp | `sounds/animals/otter.wav` |
| 17 | Jellyfish | `jellyfish` | Pulse | `sounds/animals/jellyfish.wav` |
| 18 | Starfish | `starfish` | Whoosh | `sounds/animals/starfish.wav` |
| 19 | Oyster | `oyster` | Pop | `sounds/animals/oyster.wav` |
| 20 | Sea Snail | `seasnail` | Slide | `sounds/animals/seasnail.wav` |

## Safari  (20 animals)

| # | Animal | id | Says | File to record |
|---|--------|----|------|----------------|
| 1 | Lion | `lion` | Roar | `sounds/animals/lion.wav` |
| 2 | Elephant | `elephant` | Trumpet | `sounds/animals/elephant.wav` |
| 3 | Giraffe | `giraffe` | Hum | `sounds/animals/giraffe.wav` |
| 4 | Zebra | `zebra` | Neigh | `sounds/animals/zebra.wav` |
| 5 | Hippo | `hippo` | Grunt | `sounds/animals/hippo.wav` |
| 6 | Rhino | `rhino` | Snort | `sounds/animals/rhino.wav` |
| 7 | Monkey | `monkey` | Ooh ooh | `sounds/animals/monkey.wav` |
| 8 | Gorilla | `gorilla` | Hoot | `sounds/animals/gorilla.wav` |
| 9 | Tiger | `tiger` | Growl | `sounds/animals/tiger.wav` |
| 10 | Leopard | `leopard` | Snarl | `sounds/animals/leopard.wav` |
| 11 | Camel | `camel` | Grumble | `sounds/animals/camel.wav` |
| 12 | Kangaroo | `kangaroo` | Thump | `sounds/animals/kangaroo.wav` |
| 13 | Crocodile | `crocodile` | Snap | `sounds/animals/crocodile.wav` |
| 14 | Flamingo | `flamingo` | Squawk | `sounds/animals/flamingo.wav` |
| 15 | Peacock | `peacock` | Squawk | `sounds/animals/peacock.wav` |
| 16 | Parrot | `parrot` | Hello | `sounds/animals/parrot.wav` |
| 17 | Snake | `snake` | Hiss | `sounds/animals/snake.wav` |
| 18 | Lizard | `lizard` | Skitter | `sounds/animals/lizard.wav` |
| 19 | Eagle | `eagle` | Screech | `sounds/animals/eagle.wav` |
| 20 | Sloth | `sloth` | Yawn | `sounds/animals/sloth.wav` |

---

**Total: 60 animals.**

## How the game finds them

Nothing to edit. Each roster entry works its own path out from its id:

```js
sounds: { call: 'sounds/animals/' + id + '.wav' }        // js/zones.js
```

At boot, `js/audio.js` probes all sixty. Whatever loads is registered and
played; whatever 404s is noted in one console line and falls back to the
spoken sound word. So the folder can be filled in over time, in any order,
and the game is always playable.

Where each piece lives, if it needs changing later:

| What | Where |
|------|-------|
| The path each animal expects | `a()` in `js/zones.js` |
| Loading and playback | `tryFile` / `playAnimal` in `js/audio.js` |
| When it plays (Beat 4, as the animal comes out) | `js/reveal.js` |
| Dropping the spoken word when a recording exists | `reveal()` in `js/settings.js` |

## Recording notes

- WAV, to match every other sound in the game.
- Mono is fine, and keeps the files small.
- Keep each one SHORT - about a second. It sits inside a timed sequence
  (see the beats in `js/reveal.js`), and anything long enough to talk over
  will be talked over.
- Leave no silence at the head of the file; it reads as lag on a switch.
- Record at a level consistent across all 60, so the volume
  setting means the same thing whichever animal comes out.
- Name it exactly the **id**, lowercase, no spaces: `bigwhale.wav`, not
  `Big Whale.wav`. The id is not always the displayed name - the Orca's id is
  `whale`, so its recording is `whale.wav`. Always take the id from the middle
  column above, never from the first.
