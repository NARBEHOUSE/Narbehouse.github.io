# Pet sound recordings (optional)

Every pet sound in NARBE Pet Pals is synthesized in the browser, so the game
needs no files. If you want a real recording instead, drop a WAV file with the
exact name below into this folder. On the next launch that sound uses your
recording. Nothing else needs to change, and any sound without a file keeps
the synthesized version, so you can fill this folder in over time.

A recording can be for one life stage or for all of them. Add the stage to the
name for one stage: `-baby` (puppy or kitten), `-teen`, `-adult` (grown-up) or
`-senior`, for example `dog-bark-baby.wav`. A name without a stage, such as
`dog-bark.wav`, is used at every stage that has no file of its own.

## Dog barks in use now

These came from the recordings in this folder. Puppies and teen pups use the
puppy recordings; grown-up and senior dogs use the dog recordings, with no
change in pitch. Each was made mono, trimmed so the sound starts right away,
and matched in loudness. The happy barks are the excited recording played
twice, for a longer bark. The originals are kept as the source; the game plays
the files below.

| Sound | Puppy and teen pup | Grown-up and senior dog |
|------|--------------------|-------------------------|
| Single bark | `dog-bark-baby/teen.wav` (puppy bark) | `dog-bark-adult/senior.wav` (dog bark) |
| Happy barks | `dog-bark-happy-baby/teen.wav` (puppy excited, twice) | `dog-bark-happy-adult/senior.wav` (dog excited, twice) |
| Friendly hello | `dog-bark-friendly-baby/teen.wav` (puppy happy) | `dog-bark-friendly-adult/senior.wav` (dog friendly) |
| Panting | `dog-pant.wav` (dog-panting) | `dog-pant.wav` (dog-panting) |

There is no soft boof sound in the game any more.

## Other recordings in use now (every life stage)

| Sound | Game file | From |
|------|-----------|------|
| Dog yawn | `dog-yawn.wav` | `dog yawn.wav` |
| Cat meow | `cat-meow.wav` | `meow.wav` |
| Cat sad meow | `cat-meow-sad.wav` | `sad meow.wav` |
| Cat long purr | `cat-purr.wav` | `long purr.wav` |
| Cat short purr | `cat-purr-short.wav` | `short purr.wav` |
| Cat yawn | `cat-yawn.wav` | `cat yawn.wav` |

They were prepared the same way: mono, trimmed so they start right away, and
matched in loudness (the cat yawn was recorded quietly, so it was brought up).

## Dogs and puppies

| File | When it plays |
|------|---------------|
| `dog-bark.wav` | A single bark: speaking, tricks, chasing, asking for food, barking at the mail carrier |
| `dog-bark-happy.wav` | Excited barks: zoomies, play, catching the disc, winning, rolling in mud |
| `dog-bark-friendly.wav` | A friendly hello: greeting you, friends on walks and play dates, a puppy companion, Rush arriving |
| `dog-whine.wav` | A whine when a need is very low, or when asking for a walk |
| `dog-whimper.wav` | A short, soft whimper when the pet wants love |
| `dog-pant.wav` | Happy panting after a walk or playtime |
| `dog-growl.wav` | A playful growl during tug of war |
| `dog-yawn.wav` | A yawn when sleepy |
| `dog-sigh.wav` | A contented sigh during cuddles |
| `dog-sneeze.wav` | A sneeze |
| `dog-snore.wav` | Snoring during naps |

## Cats and kittens

| File | When it plays |
|------|---------------|
| `cat-meow.wav` | A normal meow: asking for food, speaking |
| `cat-meow-sad.wav` | A long, plaintive meow when a need is very low |
| `cat-trill.wav` | A happy "mrrp" trill: greetings, play, exploring |
| `cat-purr.wav` | A long purr (about 3 seconds): cuddles, brushing, kneading |
| `cat-purr-short.wav` | A short purr (about 1.5 seconds): content moments |
| `cat-chatter.wav` | Chattering at birds through the window |
| `cat-yawn.wav` | A yawn when sleepy |
| `cat-sneeze.wav` | A sneeze |
| `cat-snore.wav` | Snoring during naps |

## Background music

The game also makes its own cozy music. To use real songs instead, drop MP3
files with these names into this folder:

| File | When it plays |
|------|---------------|
| `music-home1.mp3` | At home, first song (the five home songs play in turn, in a loop) |
| `music-home2.mp3` | At home, second song |
| `music-home3.mp3` | At home, third song |
| `music-home4.mp3` | At home, fourth song |
| `music-home5.mp3` | At home, fifth song |
| `music-walk.mp3` | While a dog is out on a walk (loops) |
| `music-explore.mp3` | While a cat is exploring (loops) |

- Keep music soft and mixed quietly (peaks well below full volume). Phones and
  tablets ignore the game's volume setting, so the file's own loudness is what
  players hear there, and text to speech must stay easy to hear over it.
- The walk and explore songs loop, so make their end run smoothly into their start.

## Recording notes

- Use WAV. Mono is fine and keeps files small.
- Trim silence from the start of the file. A gap reads as lag on a switch press.
- Keep sounds short: about a second, apart from purrs.
- Keep volume levels even across files, so the game's volume means the same
  thing for every sound.
- Name files exactly as listed: lowercase, with dashes.
- Only use recordings you have the rights to, for example your own or ones
  under a CC0 license.
