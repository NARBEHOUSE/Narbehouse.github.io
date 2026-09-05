/**
 * NARBE Animal Friends - the three zones.
 *
 * A zone is everything that makes one place different from another: its animals,
 * its palette, how its door opens, what the game calls things, and which sounds
 * it uses. Nothing else in the codebase knows a zone by name - the renderers,
 * the reveal sequence and the interface all read whatever the current zone hands
 * them. Adding a fourth zone should be adding an entry here and nothing else.
 *
 * The same three game modes and the same seven-beat reveal run in all three. The
 * door mechanic is the one piece of motion that genuinely differs, and it is
 * named here rather than branched on anywhere downstream:
 *
 *   swing  two doors hinged at their outer edges, opening outward  (Barn)
 *   swim   no door at all - the animal swims into view              (Aquarium)
 *   gate   two gates hinged at their inner edges, opening inward   (Safari)
 *
 * Every animal follows the tier system in animals.js: emoji at tier 0, ComfyUI
 * PNGs at tier 1, reviewed art plus recorded audio at tier 2. `art` and `sounds`
 * stay null until those files exist, and the boot warning names whatever is
 * still on a placeholder.
 */

window.NAF = window.NAF || {};

NAF.Zones = (function () {
    'use strict';

    /**
     * Fill in the tier-1/2 slots so a roster entry stays short to read.
     *
     * `sounds.call` is worked out from the id rather than written per animal:
     * one recording each, named after the animal, all in the same folder - so
     * sixty identical lines would be sixty chances to typo one. The file does
     * not have to exist. Nothing is loaded until it is probed at boot (see
     * tryFile in audio.js), and an animal with no recording just has its sound
     * word spoken instead, the same way one with no artwork falls back to an
     * emoji. Dropping `<id>.wav` into sounds/animals/ is the whole of adding
     * one - see ANIMAL-SOUNDS.md for the full list.
     */
    function a(id, name, says, emoji, scale) {
        return {
            id: id, name: name, says: says, emoji: emoji, scale: scale,
            art: { idle: null, call: null, happy: null },
            sounds: { call: 'sounds/animals/' + id + '.wav' }
        };
    }

    // ---------------------------------------------------------------- the barn

    const BARN = {
        id: 'barn',
        name: 'Barn',
        // What the player is told, per zone. The game never hard-codes "barn".
        words: {
            visit: 'Visit the Barn',
            place: 'barn',
            openLabel: 'Open the Barn',
            openSpoken: 'Open the barn',
            inside: 'in the barn',
            board: 'barnyard'
        },
        doors: 'swing',
        // How the zone shows up on the menu: which line icon, and which button
        // colour. Kept here so ui.js never has to know a zone by name.
        icon: 'barn',
        tone: 'red',
        animals: [
            a('cow', 'Cow', 'Moo', '🐮', 1.05),
            a('pig', 'Pig', 'Oink', '🐷', 0.92),
            a('goat', 'Goat', 'Maaa', '🐐', 0.95),
            a('sheep', 'Sheep', 'Baaa', '🐑', 0.95),
            a('horse', 'Horse', 'Neigh', '🐴', 1.10),
            a('duck', 'Duck', 'Quack', '🦆', 0.72),
            a('rooster', 'Rooster', 'Cock a doodle doo', '🐓', 0.78),
            a('dog', 'Dog', 'Woof', '🐶', 0.85),
            a('cat', 'Cat', 'Meow', '🐱', 0.82),
            a('owl', 'Owl', 'Hoot', '🦉', 0.75),
            a('turkey', 'Turkey', 'Gobble', '🦃', 0.85),
            a('bull', 'Bull', 'Snort', '🐂', 1.12),
            a('llama', 'Llama', 'Hum', '🦙', 1.00),
            a('rabbit', 'Rabbit', 'Thump', '🐰', 0.68),
            a('mouse', 'Mouse', 'Squeak', '🐭', 0.60),
            a('bee', 'Bee', 'Buzz', '🐝', 0.55),
            a('frog', 'Frog', 'Ribbit', '🐸', 0.66),
            a('butterfly', 'Butterfly', 'Flutter', '🦋', 0.62),
            a('hedgehog', 'Hedgehog', 'Snuffle', '🦔', 0.62),
            a('squirrel', 'Squirrel', 'Chatter', '🐿️', 0.64)
        ],
        theme: {
            // Sky: four stops, top to bottom. Drives the gradient behind
            // everything, and `flat` is the Bright preset's version of it.
            sky: ['#2f7fc4', '#79c4ea', '#ffd9a0', '#ffb673'],
            skyFlat: ['#5fb7e8', '#bfe6f7'],
            sunGlow: 'rgba(255,248,214,0.95)',
            cloud: 'rgba(255,255,255,0.92)',
            // Far hills behind the building: back band, front band.
            hills: ['#5c9a52', '#3f7c3c'],
            // The ground plane, far to near. Deliberately near-flat: a gradient
            // that lightened toward the camera read as a gap in the ground.
            ground: ['#5a8733', '#5b8a33', '#5c8b34'],
            scuff: 'rgba(0,0,0,0.09)',
            // The building. `shape` is its silhouette, drawn in scenery.js:
            // gambrel | tank | thatch. Every shape must stay inside the same
            // envelope, which is what the camera framing solve fits to the
            // screen - see geom() in stage3d.js. `roofDetail` is the line
            // colour of the roof's boards.
            shape: 'gambrel',
            wall: '#b8382f',
            wallEdge: '#3a1410',
            trim: '#f6efe2',
            roof: '#b8382f',
            roofDetail: 'rgba(58,20,16,0.28)',
            batten: 'rgba(58,20,16,0.30)',
            // The gable feature: a paned loft window.
            gable: 'window',
            gableGlass: '#bfe3f2',
            // The door leaves.
            door: '#c24236',
            doorPlank: 'rgba(58,20,16,0.35)',
            doorBrace: '#f6efe2',
            // What is inside, before an animal steps out of it.
            interior: ['#140d09', '#2c1c12'],
            interiorBand: 'rgba(0,0,0,0.45)',
            clutter: '#5a4520',            // hay bales
            lamp: 'rgba(255,206,120,0.95)',
            // The dark floor inside the doorway, back to front.
            floor: ['#2a1d11', '#4a3418', '#5a4020'],
            // The fringe of foreground growth along the bottom of the frame.
            fringe: ['#3f6b26', '#4f8130'],
            // The shaft of light in the doorway, and the motes floating in it.
            shaft: ['rgba(255,226,160,0.85)', 'rgba(255,214,140,0.38)', 'rgba(255,205,130,0)'],
            haze: ['rgba(255,228,168,0.42)', 'rgba(255,214,140,0.02)'],
            dust: 'rgba(255,242,206,1)',
            seam: 0xffd88a,        // the line of light at the closed doors
            glow: ['rgba(255,246,220,0.92)', 'rgba(255,226,160,0.38)', 'rgba(255,214,140,0)'],
            // Warm sun, cool sky fill.
            sun: 0xfff0cf,
            rim: 0xffb066,
            ambientSky: 0xbfe0ff,
            ambientGround: 0x50401f,
            // Dressing shown on Full farm only: what stands behind and beside
            // the building. Each name is a canvas generator in scenery.js.
            dressing: 'fence',
            bed: 'flowers',
            // The menu's backdrop. That is a CSS gradient on the overlay rather
            // than the 3D stage - the overlay covers the canvas - so it needs
            // its own colours: the sun's glow, the drifting clouds, four sky
            // stops with the horizon at 70%, then two ground stops. These are
            // the barn menu's long-standing colours, kept exactly as they were.
            menuBg: {
                sun: 'rgba(255,249,214,0.95)',
                cloud: 'rgba(255,255,255,0.90)',
                sky: ['#1d5f9e', '#4fa2d8', '#a9dcf3', '#ffd79a'],
                ground: ['#6d9c3d', '#4d7a2c']
            }
        },
        sounds: {
            open: 'creak',
            close: 'thump',
            press: 'press',
            rattle: 'rattle',
            song: 'barnsong',
            // A rare bit of life during looking time - see reveal.js. Not one of
            // the seven beats; it fires or it doesn't, at random, and quietly.
            ambient: 'birdchirp'
        }
    };

    // ------------------------------------------------------------ the aquarium

    const AQUARIUM = {
        id: 'aquarium',
        name: 'Aquarium',
        words: {
            visit: 'Visit the Aquarium',
            place: 'tank',
            openLabel: 'Open the Tank',
            openSpoken: 'Open the tank',
            inside: 'in the tank',
            board: 'aquarium'
        },
        // No door: the animal swims into view across the open glass instead of
        // stepping out through an opening. See stage3d.js/stage2d.js for what
        // that changes about the reveal, and scenery.js for the glass itself,
        // which is drawn with no doorway cut into it at all.
        doors: 'swim',
        icon: 'tank',
        tone: 'blue',
        animals: [
            a('fish', 'Fish', 'Blub', '🐟', 0.78),
            a('tropicalfish', 'Tropical Fish', 'Bloop', '🐠', 0.76),
            a('blowfish', 'Blowfish', 'Puff', '🐡', 0.74),
            a('shark', 'Shark', 'Chomp', '🦈', 1.15),
            a('octopus', 'Octopus', 'Squish', '🐙', 0.95),
            a('squid', 'Squid', 'Swoosh', '🦑', 0.90),
            a('crab', 'Crab', 'Snip', '🦀', 0.72),
            a('lobster', 'Lobster', 'Click', '🦞', 0.82),
            a('shrimp', 'Shrimp', 'Flick', '🦐', 0.60),
            a('dolphin', 'Dolphin', 'Eee eee', '🐬', 1.05),
            // Named Orca, but the id stays 'whale' - the id is what names the
            // recording (sounds/animals/whale.wav) and keys the facts, so
            // renaming it would silently drop both. Its picture is drawn in
            // animals.js rather than taken from the emoji font.
            a('whale', 'Orca', 'Whoooo', '🐳', 1.20),
            a('bigwhale', 'Big Whale', 'Splash', '🐋', 1.25),
            a('seal', 'Seal', 'Arf arf', '🦭', 0.95),
            a('penguin', 'Penguin', 'Squawk', '🐧', 0.80),
            a('turtle', 'Turtle', 'Splish', '🐢', 0.85),
            a('otter', 'Otter', 'Chirp', '🦦', 0.82),
            // Swan and shell moved out: a swan is a pond and park-lake bird, not
            // a tank animal, and a shell is what a mollusk lives in rather than
            // an animal in its own right. A jellyfish and a starfish are both
            // genuine tank residents and are far more recognisable to a child.
            a('jellyfish', 'Jellyfish', 'Pulse', '🪼', 0.68),
            a('starfish', 'Starfish', 'Whoosh', '⭐', 0.58),
            a('oyster', 'Oyster', 'Pop', '🦪', 0.62),
            a('seasnail', 'Sea Snail', 'Slide', '🐌', 0.60)
        ],
        theme: {
            // Underwater. The gradient runs the other way from the barn's: dark
            // in the depths at the top, brightening toward the sandy floor.
            sky: ['#04314f', '#0a5b83', '#2b91b4', '#5cbcd6'],
            skyFlat: ['#0d6b95', '#5fc3dd'],
            sunGlow: 'rgba(198,244,255,0.85)',
            cloud: 'rgba(214,248,255,0.34)',   // drifting light, not cloud
            hills: ['#2b7f96', '#175d75'],     // far reef bands
            // Sand, pushed warm and light on purpose: a true tan under this
            // zone's cool ambient came out a muddy grey-green.
            ground: ['#d8c391', '#e2cf9f', '#ead9ac'],
            scuff: 'rgba(255,255,255,0.10)',   // ripples, lighter not darker
            shape: 'tank',
            wall: '#2f7f9e',                   // the tank's frame and hood
            // The water in the glass, top to bottom. Only the tank shape reads
            // this; the other two have no glass to fill.
            pane: ['#9ee4f2', '#2f88ab'],
            wallEdge: '#0d3b50',
            trim: '#e8f7fb',
            roof: '#2a6f8c',
            roofDetail: 'rgba(13,59,80,0.30)',
            batten: 'rgba(13,59,80,0.26)',
            // Nothing above the hatch. The riveted port that used to sit here
            // was a second round thing directly over the animal - see
            // gableFeature() in scenery.js. gableGlass is still read by the
            // menu card, so it stays.
            gable: 'none',
            gableGlass: '#a8e4f4',
            door: '#8fd8ea',                   // the glass hatch
            doorPlank: 'rgba(255,255,255,0.22)',
            doorBrace: '#e8f7fb',
            interior: ['#03202f', '#07405a'],
            interiorBand: 'rgba(0,0,0,0.30)',
            clutter: '#1d6a5a',                // weed clumps, not hay bales
            lamp: 'rgba(180,240,255,0.9)',
            floor: ['#062a3c', '#0d4d63', '#2c7d8f'],
            fringe: ['#1c6b5c', '#2f9a7c'],    // sea grass along the bottom
            shaft: ['rgba(190,240,255,0.80)', 'rgba(160,225,250,0.34)', 'rgba(150,220,250,0)'],
            haze: ['rgba(200,244,255,0.38)', 'rgba(170,230,250,0.02)'],
            dust: 'rgba(228,250,255,1)',       // bubbles rather than motes
            seam: 0xa8ecff,
            glow: ['rgba(226,250,255,0.90)', 'rgba(170,232,252,0.36)', 'rgba(150,220,250,0)'],
            // Only lightly cool. A strongly blue fill turned the sand a muddy
            // sage - the underwater feel comes from the water gradient behind
            // everything, not from tinting the light that falls on the sand.
            sun: 0xf2f8f4,
            rim: 0x8ad8f0,
            ambientSky: 0xcfe6f0,
            ambientGround: 0x7a6f52,
            dressing: 'coral',
            bed: 'anemones',
            // Underwater: dark in the depths above, brightening downward to a
            // sandy floor. The "sun" is the patch of daylight on the surface.
            menuBg: {
                sun: 'rgba(198,244,255,0.85)',
                cloud: 'rgba(206,244,255,0.42)',
                sky: ['#04314f', '#0a5b83', '#2b91b4', '#5cbcd6'],
                ground: ['#d8c391', '#b8a274']
            }
        },
        sounds: {
            // A splash in, a splash out - not a hatch, since there is no hatch.
            open: 'splashin',
            close: 'splashout',
            press: 'tap',
            rattle: 'bubbles',
            song: 'tanksong',
            ambient: 'shimmer'
        }
    };

    // --------------------------------------------------------------- the safari

    const SAFARI = {
        id: 'safari',
        name: 'Safari',
        words: {
            visit: 'Visit the Safari',
            place: 'gate',
            openLabel: 'Open the Gate',
            openSpoken: 'Open the gate',
            inside: 'behind the gate',
            board: 'safari park'
        },
        doors: 'gate',
        icon: 'gate',
        tone: 'amber',
        animals: [
            a('lion', 'Lion', 'Roar', '🦁', 1.10),
            a('elephant', 'Elephant', 'Trumpet', '🐘', 1.30),
            a('giraffe', 'Giraffe', 'Hum', '🦒', 1.30),
            a('zebra', 'Zebra', 'Neigh', '🦓', 1.05),
            a('hippo', 'Hippo', 'Grunt', '🦛', 1.15),
            a('rhino', 'Rhino', 'Snort', '🦏', 1.18),
            a('monkey', 'Monkey', 'Ooh ooh', '🐵', 0.80),
            a('gorilla', 'Gorilla', 'Hoot', '🦍', 1.15),
            a('tiger', 'Tiger', 'Growl', '🐯', 1.05),
            a('leopard', 'Leopard', 'Snarl', '🐆', 1.00),
            a('camel', 'Camel', 'Grumble', '🐫', 1.15),
            a('kangaroo', 'Kangaroo', 'Thump', '🦘', 1.00),
            a('crocodile', 'Crocodile', 'Snap', '🐊', 1.05),
            a('flamingo', 'Flamingo', 'Squawk', '🦩', 0.95),
            a('peacock', 'Peacock', 'Squawk', '🦚', 0.95),
            a('parrot', 'Parrot', 'Hello', '🦜', 0.78),
            a('snake', 'Snake', 'Hiss', '🐍', 0.85),
            a('lizard', 'Lizard', 'Skitter', '🦎', 0.66),
            a('eagle', 'Eagle', 'Screech', '🦅', 0.90),
            a('sloth', 'Sloth', 'Yawn', '🦥', 0.85)
        ],
        theme: {
            // A hot, high savanna sky bleaching out toward the horizon, and dry
            // grass underfoot rather than green.
            sky: ['#2d6ea8', '#8fc4dd', '#ffd08a', '#ffbe72'],
            skyFlat: ['#5aa6cf', '#cfe8f2'],
            sunGlow: 'rgba(255,238,180,0.95)',
            cloud: 'rgba(255,252,240,0.72)',   // thin, high and dusty
            hills: ['#9a8a4c', '#6b5c2c'],
            ground: ['#a08a3c', '#a8913f', '#b39a45'],   // dry grass
            scuff: 'rgba(90,60,20,0.12)',
            shape: 'thatch',
            wall: '#8a6a3c',                   // timber stockade
            wallEdge: '#3a2a14',
            trim: '#e5d6ae',
            roof: '#6e5228',
            roofDetail: 'rgba(58,42,20,0.34)',
            batten: 'rgba(58,42,20,0.32)',
            gable: 'sign',                     // a carved board, not a window
            gableGlass: '#c9a86a',
            door: '#9a7742',
            doorPlank: 'rgba(58,42,20,0.38)',
            doorBrace: '#e5d6ae',
            interior: ['#171008', '#33240f'],
            interiorBand: 'rgba(0,0,0,0.40)',
            clutter: '#6b5a2a',                // scrub and rocks
            lamp: 'rgba(255,216,140,0.9)',
            floor: ['#2a1d0c', '#4d3a16', '#6a5220'],
            fringe: ['#6b5a24', '#93803a'],    // dry tussock along the bottom
            shaft: ['rgba(255,232,170,0.85)', 'rgba(255,220,150,0.38)', 'rgba(255,212,140,0)'],
            haze: ['rgba(255,234,176,0.44)', 'rgba(255,220,150,0.02)'],
            dust: 'rgba(255,240,200,1)',
            seam: 0xffe2a0,
            glow: ['rgba(255,248,224,0.92)', 'rgba(255,230,168,0.38)', 'rgba(255,218,146,0)'],
            sun: 0xfff2d0,
            rim: 0xffab5c,
            ambientSky: 0xd6e8ff,
            ambientGround: 0x6a5522,
            dressing: 'acacia',
            bed: 'scrub',
            // A hot sky bleaching out at the horizon, over dry grass.
            menuBg: {
                sun: 'rgba(255,238,180,0.95)',
                cloud: 'rgba(255,252,240,0.78)',
                sky: ['#2d6ea8', '#8fc4dd', '#ffd08a', '#ffbe72'],
                ground: ['#a8913f', '#8a7433']
            }
        },
        sounds: {
            open: 'gateopen',
            close: 'gateclose',
            press: 'press',
            rattle: 'rattle',
            song: 'safarisong',
            ambient: 'critter'
        }
    };

    const ZONES = [BARN, AQUARIUM, SAFARI];
    const byId = {};
    ZONES.forEach(function (z) { byId[z.id] = z; });

    return {
        list: ZONES,
        byId: function (id) { return byId[id] || BARN; },
        /** The zone the player is in, from settings, always a real zone. */
        current: function () { return byId[NAF.Settings.get('zone')] || BARN; },
        /**
         * Move to a zone and remember it. Ignores an id that is not a zone
         * rather than throwing, so a stale saved value can never strand the
         * player on a screen with nothing to choose. Returns the zone in force.
         */
        set: function (id) {
            if (byId[id]) NAF.Settings.set('zone', id);
            return byId[NAF.Settings.get('zone')] || BARN;
        }
    };
})();
