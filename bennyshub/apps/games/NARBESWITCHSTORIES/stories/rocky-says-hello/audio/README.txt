RECORDED NARRATION FOR "ROCKY SAYS HELLO"

Put your recordings in this folder, named exactly like this:

  cover.mp3     Rocky Says Hello.
  page-01.mp3   Rocky waves. Hello Rocky!
  page-02.mp3   Rocky is a Blue Heeler puppy with lots of energy!
  page-03.mp3   Rocky loves chasing balls. Watch Rocky go!
  page-04.mp3   Rocky enjoys watching birds. Rocky watches the bird fly away. Goodbye birdie.
  page-05.mp3   Rocky sees a puddle. Rocky loves playing in water. Splash!
  page-06.mp3   Rocky yawns. Rocky curls up to sleep. Goodnight Rocky!
  page-07.mp3   The End.

That is all: no change to story.js is needed. The game finds them by name.

- Use lowercase names with a dash and two-digit numbers (page-01, not Page 1).
- MP3 works everywhere (Chrome, tablets and the desktop app).
- A page with no recording is read by the computer voice, so you can record
  a few pages at a time.
- Settings > Reading > Narration chooses Recorded Voice (uses these files)
  or Computer Voice (ignores them).
- Leave a short moment of quiet at the end of each recording: the action
  starts as soon as the recording ends.

To use a different name or format (for example .m4a), write it on that
page in story.js:   narration: 'audio/my-recording.m4a'
