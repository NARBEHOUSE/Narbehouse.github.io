/**
 * Rocky Says Hello - the first NARBE Switch Stories book.
 *
 * Rocky is a blue heeler puppy (original art is in the local reference archive). His poses and the
 * things on each page are transparent pictures in sprites/. Each one has a
 * Simple High Contrast partner with -cvi in its name (rocky-sit.webp and
 * rocky-sit-cvi.webp), which the game finds by itself.
 * Paw and object contacts are measured by tools/measure-rocky-story-contacts.ps1.
 * Grounded poses keep those contacts still; jumps keep their shadow on the floor.
 *
 * Recordings: put cover.mp3, page-01.mp3 ... page-07.mp3 in audio/ and they
 * are played instead of the computer voice (see audio/README.txt).
 *
 * The two barks in sounds/ are NARBE Pet Pals' puppy barks
 * (dog-bark-friendly-baby.wav and dog-bark-happy-baby.wav).
 */

NSS.registerStory({
    title: 'Rocky Says Hello',
    availableOn: '2026-10-19', // First available on the hub; hidden, used only for Newest sorting.
    description: 'Rocky is ready for a day of fun. What will this playful puppy get up to next?',
    readingTag: 'Repetition',
    storyType: 'original',
    credits: { text: 'Original story by NARBE LLC, illustrations and animations made with AI. Created for free, open-source sharing to expand accessible reading choices for switch users.' },
    tags: ['Animals'],
    contactShadows: NSS.RockyContactShadows,
    cviOutline: 'alpha', // Clean high-resolution art; the renderer adds the selected outline once.

    // Rocky's poses. The first one is the pose a page uses when it names none.
    character: {
        grounded: true,
        poses: {
            'sit':       'sprites/rocky-sit.webp',
            'wave':      'sprites/rocky-wave.webp',
            'wag':       'sprites/rocky-wag.webp',
            'stand':     'sprites/rocky-stand.webp',
            'jump':      'sprites/rocky-jump.webp',
            'look-up':   'sprites/rocky-look-up.webp',
            'yawn':      'sprites/rocky-yawn.webp',
            'sleep':     'sprites/rocky-sleep.webp',
            'celebrate': 'sprites/rocky-celebrate.webp'
        }
    },

    // The things on the pages.
    objects: {
        'ball':        'sprites/ball.webp',
        'bird':        'sprites/bird.webp',
        'bird-flying': 'sprites/bird-flying.webp',
        'puddle':      'sprites/puddle.webp',
        'moon':        'sprites/moon.webp',
        'star':        'sprites/star.webp'
    },

    // pose: before the action    actionPose: during it    afterPose: once it is done
    // afterSound: plays right after the action (a real puppy bark, from NARBE Pet Pals)
    pages: [
        // The cover introduces the book. Nothing happens: Rocky sits, the title is read.
        { text: 'Rocky Says Hello.',
          action: 'none', bg: '#9fd8ff',
          pose: 'sit' },

        // The only page where Rocky waves. He waves hello, sits back down, then barks.
        { text: 'Rocky waves. Hello Rocky!',
          action: 'wave', bg: '#e3d4ff',
          pose: 'sit', actionPose: 'wave', afterPose: 'sit',
          actionSound: 'none', afterSound: 'sounds/bark-hello.wav' },

        // Full of energy: Rocky jumps up and wags his tail.
        { text: 'Rocky is a Blue Heeler puppy with lots of energy!',
          action: 'wag', bg: '#ffc9dc',
          pose: 'sit', actionPose: 'wag', afterPose: 'wag' },

        // The ball rolls away and Rocky runs after it.
        { text: 'Rocky loves chasing balls. Watch Rocky go!',
          action: 'chase', bg: '#b7ecc4', object: 'ball',
          pose: 'stand', actionPose: 'jump', afterPose: 'stand' },

        // The bird flies up over Rocky's head, where he is looking, then away.
        { text: 'Rocky enjoys watching birds. Rocky watches the bird fly away. Goodbye birdie.',
          action: 'fly', bg: '#ffe08a', object: 'bird',
          pose: 'sit', actionPose: 'look-up', afterPose: 'look-up' },

        { text: 'Rocky sees a puddle. Rocky loves playing in water. Splash!',
          action: 'splash', bg: '#c9d4ff', object: 'puddle',
          pose: 'stand', actionPose: 'jump' },

        { text: 'Rocky yawns. Rocky curls up to sleep. Goodnight Rocky!',
          action: 'sleep', bg: '#283a7a', object: 'moon',
          pose: 'yawn', actionPose: 'sleep', afterPose: 'sleep' },

        // Rocky jumps for joy, waves goodbye, then barks.
        { text: 'The End.',
          action: 'celebrate', bg: '#ffb38a',
          pose: 'sit', actionPose: 'celebrate', afterPose: 'wave',
          afterSound: 'sounds/bark-happy.wav' }
    ]
});
