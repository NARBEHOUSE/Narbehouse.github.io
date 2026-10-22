/**
 * Lily Loves Books - NARBE Switch Stories.
 *
 * Kids with and without disabilities reading together. Lily uses a
 * wheelchair and reads on a tablet on a stand, turning pages with a red
 * switch on her lap (connected to the tablet by a cable). Amber also uses a red
 * switch with her tablet; she is not in a wheelchair. Sam does not use a
 * switch. Original character references are in the local archive; see ../../ASSET-OPTIMIZATION.md.
 *
 * Pictures: optimized from the archived exports of tools/prepare-lily-story-art.ps1.
 * Each transparent sprite has a Simple High Contrast partner (-cvi) and
 * an outline ring (-cvi-outline), found by name.
 *
 * Recordings: cover.mp3, page-01.mp3 ... page-09.mp3 in audio/.
 */

NSS.registerStory({
    title: 'Lily Loves Books',
    availableOn: '2026-10-20', // First available on the hub; hidden, used only for Newest sorting.
    description: 'Lily is ready to open a book with her switch. Come along and see where the next page takes her.',
    readingTag: 'Repetition',
    storyType: 'original',
    credits: { text: 'Original story by NARBE LLC, illustrations and animations made with AI. Created for free, open-source sharing to expand accessible reading choices for switch users.' },
    tags: ['Friendship', 'Everyday Life'],
    contactShadows: NSS.LilyContactShadows,

    // Each child's poses: transparent pictures, made to one shared scale.
    cast: {
        lily: {
            name: 'Lily',
            size: 0.9,
            grounded: true,
            poses: {
                'seated':       'sprites/lily-seated.webp',
                'waving':       'sprites/lily-waving.webp',
                'rolling':      'sprites/lily-rolling.webp',
                'rolling-release': 'sprites/lily-rolling-release.webp',
                'tablet':       'sprites/lily-tablet.webp',        // with her tablet stand and red switch (page 3 only)
                'tablet-press': 'sprites/lily-tablet-press.webp',  // pressing the switch; the tablet page has turned
                'reading':      'sprites/lily-reading.webp',
                'cheering':     'sprites/lily-cheering.webp'
            }
        },
        mia: {
            name: 'Amber',
            size: 0.92,
            grounded: true,
            poses: {
                'tablet':   'sprites/mia-tablet.webp',             // at the table, her tablet and red switch in front of her
                'press':    'sprites/mia-press.webp',              // pressing her switch; the tablet lights up
                'reading':  'sprites/mia-reading.webp',
                'cheering': 'sprites/mia-cheering.webp'
            }
        },
        sam: {
            name: 'Sam',
            grounded: true,
            poses: {
                'standing': 'sprites/sam-standing.webp',
                'waving':   'sprites/sam-waving.webp',
                'reading':  'sprites/sam-reading.webp',
                'cheering': 'sprites/sam-cheering.webp'
            }
        }
    },

    objects: {
        'eiffel-tower':         'sprites/eiffel-tower.webp',
        'pyramid':              'sprites/pyramid.webp',
        'kangaroo':             'sprites/kangaroo.webp',
        'kangaroo-jump':        'sprites/kangaroo-jump.webp',
        'friends-holding':      'sprites/friends-holding.webp',
        'friends-cheering':     'sprites/friends-cheering.webp',
        // Simple High Contrast (pages 3 and 8): the tablets on their own.
        'tablet-switch':        'sprites/tablet-switch.webp',
        'tablet-switch-turned': 'sprites/tablet-switch-turned.webp',
        'mia-tablet':           'sprites/mia-tablet-only.webp',
        'mia-tablet-lit':       'sprites/mia-tablet-lit.webp'
    },

    // cast: who is on the page, where (at: 0 left .. 1 right), and their pose
    //       before the action, during it (actionPose) and after it (afterPose).
    // cvi:  what Simple High Contrast shows, alone on black.
    pages: [
        // Page 1 (the cover)
        { text: 'Lily Loves Books',
          background: 'backgrounds/bedroom.webp', bg: '#f6dcc8',
          panorama: { image: 'backgrounds/panoramas/bedroom.webp', floor: [0.75, 0.94], edge: 0.08 },
          backgroundFloor: [0.76574, 0.95463], // Complete floorboards, rows 827..1031 in the 1080px export.
          backgroundFit: 'contain', characterHeight: 0.858, ground: 0.9,
          action: 'wave',
          cast: [{ who: 'lily', at: 0.5, pose: 'seated', actionPose: 'waving', afterPose: 'seated' }],
          cvi: { show: ['lily'] } },

        // Page 2
        { text: 'This is Lily. Lily rolls in her wheelchair.',
          background: 'backgrounds/living-room.webp', bg: '#f2e4c6',
          panorama: { image: 'backgrounds/panoramas/living-room.webp', floor: [0.8, 1], edge: 0.08 },
          backgroundFloor: [0.76481, 0.95463], // Complete floorboards, rows 826..1031.
          backgroundFit: 'contain', characterHeight: 0.858, ground: 0.9,
          action: 'roll', from: [0.15, 0],
          cast: [{ who: 'lily', at: 0.68, pose: 'rolling', actionPose: 'rolling-release', afterPose: 'rolling-release' }],
          cvi: { show: ['lily'] } },

        // Page 3
        { text: 'Lily reads on her tablet. She presses her switch to turn the page. Click!',
          background: 'backgrounds/bedroom.webp', bg: '#f6dcc8',
          panorama: { image: 'backgrounds/panoramas/bedroom.webp', floor: [0.75, 0.94], edge: 0.08 },
          backgroundFloor: [0.76574, 0.95463],
          backgroundFit: 'contain', characterHeight: 0.858, ground: 0.9,
          action: 'press',
          cast: [{ who: 'lily', at: 0.5, pose: 'tablet', actionPose: 'tablet-press', afterPose: 'tablet-press' }],
          cvi: { object: 'tablet-switch', actionObject: 'tablet-switch-turned' } },

        // Page 4
        { text: 'Lily reads about France. Look, a tall tower!',
          background: 'backgrounds/tablet-france.webp', backgroundFit: 'contain', backgroundExtend: true, bg: '#b9e6f7',
          action: 'popup', object: 'eiffel-tower', from: [0.5, 0.82], objectSize: 0.7 },

        // Page 5
        { text: 'Lily reads about Egypt. Look, a pyramid!',
          background: 'backgrounds/tablet-egypt.webp', backgroundFit: 'contain', backgroundExtend: true, bg: '#b4e4f6',
          action: 'rise', object: 'pyramid', from: [0.5, 0.82], objectSize: 0.55 },

        // Page 6
        { text: 'Lily reads about Australia. Look, a kangaroo! Hop, hop!',
          background: 'backgrounds/tablet-australia.webp', backgroundFit: 'contain', backgroundExtend: true, bg: '#b9e7f6',
          action: 'hopacross', object: 'kangaroo', objectAction: 'kangaroo-jump',
          from: [0.2, 0.85], objectSize: 0.43, ground: 0.85,
          objectBounds: [0.085, 0.11, 0.915, 0.87], cvi: { sizeLike: 'lily' } },

        // Page 7
        { text: 'Lily rolls to school.',
          background: 'backgrounds/school-doors-closed.webp', afterBackground: 'backgrounds/school-doors-open.webp', bg: '#cfe8ff',
          panorama: { image: 'backgrounds/panoramas/school-doors-closed.webp', afterImage: 'backgrounds/panoramas/school-doors-open.webp',
            extensionImage: 'backgrounds/panoramas/school-wings.webp',
            floor: [0.825, 0.985], edge: 0.06, afterBounds: [0.426, 0.324, 0.573, 0.66] },
          backgroundFloor: [0.78796, 0.95926], // Paving seams, rows 851..1036 in both door images.
          backgroundFit: 'contain', characterHeight: 0.544, ground: 0.82,
          action: 'arrive', from: [0.1, 0],
          cast: [{ who: 'lily', at: 0.5, pose: 'rolling', actionPose: 'rolling-release', afterPose: 'rolling-release' }],
          cvi: { show: ['lily'] } },

        // Page 8
        { text: 'Lily meets Sam and Amber. Amber uses a switch too!',
          background: 'backgrounds/classroom.webp', bg: '#fbe7c6',
          panorama: { image: 'backgrounds/panoramas/classroom.webp', floor: [0.86, 0.975], edge: 0.07 },
          backgroundFloor: [0.88148, 0.95000], // Clear floor below every chair leg, rows 952..1026.
          backgroundFit: 'contain', characterHeight: 0.66, ground: 0.9,
          action: 'press', actor: 'mia',
          cast: [
              { who: 'lily', at: 0.22, pose: 'seated' },
              { who: 'mia', at: 0.5, pose: 'tablet', actionPose: 'press', afterPose: 'press' },
              { who: 'sam', at: 0.78, pose: 'standing', actionPose: 'waving', afterPose: 'waving', wiggle: true }
          ],
          cvi: { object: 'mia-tablet', actionObject: 'mia-tablet-lit' } },

        // Page 9
        { text: 'They read together. Lily has new friends!',
          background: 'backgrounds/classroom.webp', bg: '#fbe7c6',
          panorama: { image: 'backgrounds/panoramas/classroom.webp', floor: [0.86, 0.975], edge: 0.07 },
          backgroundFloor: [0.88148, 0.95000],
          backgroundFit: 'contain', characterHeight: 0.66, ground: 0.9,
          action: 'gather', actor: 'lily', castOverlap: 0.4,
          cast: [
              // Sam stands behind the chair; the table stays in front of
              // Lily's footrest as she rolls close enough to share the screen.
              { who: 'sam', at: 0.75, afterAt: 0.68, pose: 'reading', actionPose: 'reading', afterPose: 'reading' },
              { who: 'lily', at: 0.25, afterAt: 0.3, pose: 'reading', actionPose: 'rolling-release', afterPose: 'reading', settleAt: 0.7 },
              { who: 'mia', at: 0.5, pose: 'reading', actionPose: 'reading', afterPose: 'reading' }
          ],
          cvi: { show: ['lily', 'mia', 'sam'], keepPositions: true } },

        // Page 10
        { text: 'The End',
          background: 'backgrounds/classroom.webp', bg: '#fbe7c6',
          panorama: { image: 'backgrounds/panoramas/classroom.webp', floor: [0.86, 0.975], edge: 0.07 },
          backgroundFloor: [0.88148, 0.95000],
          backgroundFit: 'contain', ground: 0.9,
          action: 'celebrate',
          object: 'friends-holding', objectAction: 'friends-cheering', objectSize: 0.68,
          from: [0.5, 0.9],
          cvi: { object: 'friends-holding', actionObject: 'friends-cheering' } }
    ]
});
