/**
 * NARBE Space Explorer - creatures, built from parts (spec headless, build needs THREE).
 *
 *   spec(seed, world)          what a creature is: body plan, legs, eyes, colours, size, how
 *                              it moves and the funny words the scanner says about it.
 *                              Same seed + same world type = the same creature, always.
 *   build(THREE, spec, detail) a low-poly model of it, with update() for its animations
 *                              (walk cycles, hops, wing beats, wags, blinks, grazing).
 *   words(spec)                the scanner's lines, in order.
 *   peopleLook(seed, type)     how a civilisation's people look (the scanner's 3D model when
 *                              spec.people is set, and the face on an alien call, NSE.Aliens).
 *
 * Built like a nature film's friendly cousins, not toys (the user: the old ones looked "very
 * very silly"). What makes them read well, from character-design and procedural-creature
 * practice (Spore, No Man's Sky):
 *   - real body plans with anatomy: grazers with necks and two-jointed legs, upright hoppers,
 *     crabs, frogs, rays, caterpillars, jellyfish, tortoises, beetles, snails, birds and moths
 *   - proportions from the seed inside rules per plan, so they vary but always hold together
 *   - eyes set into the head with lids, a coloured iris and a shine (alive, never googly);
 *     muzzles, noses and beaks instead of a smiley on everything
 *   - colour harmony: a main hue picked against the ground so it stands out, a darker back and
 *     a pale belly (countershading), an accent from an analogous / complementary / triad rule,
 *     and soft painted patterns (spots, stripes, patches, a saddle, a mask, rings, speckles)
 *   - round, soft shapes: no teeth, claws or spikes; still funny, never scary
 *
 * Loads in plain Node too (the tests): no DOM, and THREE is only used inside build(). Lambert
 * and Basic materials only, vertex colours, no textures and no custom shaders. Static parts are
 * merged into one mesh per joint and material (a creature is a few dozen draw calls).
 */

window.NSE = window.NSE || {};

NSE.Creatures = (function () {
    'use strict';

    const U = NSE.Util;

    const BODIES = ['puff', 'quad', 'biped', 'flat', 'worm', 'jelly', 'shell', 'flyer'];
    const MOVES = ['hop', 'drift', 'crawl', 'float', 'walk', 'roll', 'slither'];
    const PATTERNS = ['plain', 'spots', 'stripes', 'patches', 'saddle', 'mask', 'rings', 'speckles'];

    // --- what lives where -------------------------------------------------------------------------

    const BODY_BY_TYPE = {
        ice: [['quad', 3.5], ['puff', 3], ['biped', 2.6], ['flyer', 1.3], ['shell', 1], ['flat', 1], ['worm', 0.8], ['jelly', 0.3]],
        ocean: [['jelly', 3.2], ['flat', 3], ['puff', 1.8], ['shell', 2], ['worm', 1.8], ['quad', 1.4], ['flyer', 1.5], ['biped', 1]],
        earth: [['quad', 3.6], ['puff', 2.4], ['biped', 2.4], ['flyer', 2.2], ['shell', 1.6], ['worm', 1.4], ['flat', 1.2], ['jelly', 0.4]],
        desert: [['quad', 3], ['biped', 2.6], ['shell', 2.2], ['puff', 1.8], ['worm', 2], ['flat', 1.5], ['flyer', 1], ['jelly', 0.2]],
        lava: [['shell', 2.6], ['quad', 2.5], ['puff', 2.2], ['worm', 2], ['biped', 1.5], ['flat', 1.5], ['flyer', 1], ['jelly', 0.3]],
        crystal: [['shell', 2.4], ['flyer', 2.2], ['quad', 2], ['puff', 2], ['jelly', 1.5], ['biped', 1.5], ['flat', 1.4], ['worm', 1]],
        toxic: [['flat', 2.6], ['worm', 2.5], ['jelly', 2.4], ['puff', 2.4], ['shell', 1.6], ['flyer', 1.5], ['quad', 1.5], ['biped', 1.1]],
        gas: [['jelly', 5], ['flyer', 3], ['flat', 2.4], ['puff', 2]],
        rock: [['shell', 2.6], ['puff', 2.5], ['flat', 2.4], ['worm', 2], ['quad', 1.5], ['biped', 0.6]]
    };

    /** Which ways each body plan can get about (no legs never walks; only shelled balls roll). */
    const MOVE_BY_BODY = {
        puff: [['hop', 4], ['walk', 2.5], ['float', 1.2], ['crawl', 0.8]],
        quad: [['walk', 5], ['crawl', 1.4]],
        biped: [['walk', 4], ['hop', 3]],
        flat: [['crawl', 4], ['hop', 1.3], ['float', 1.2], ['drift', 0.9]],
        worm: [['slither', 5], ['crawl', 2]],
        jelly: [['float', 1], ['drift', 1]],
        shell: [['walk', 3], ['crawl', 3.4], ['roll', 1.3]],
        flyer: [['drift', 3], ['float', 2], ['hop', 1.4], ['walk', 1.4]]
    };

    /** The world nudges the choice: swimmers in the sea, crawlers on moons, floating gems. */
    const MOVE_MOD = {
        ocean: { float: 2.2, slither: 1.4 },
        rock: { crawl: 2, hop: 1.5, float: 0.3, drift: 0.3, walk: 0.7 },
        crystal: { float: 1.6, drift: 1.8 },
        ice: { walk: 1.4, roll: 1.4 },
        desert: { roll: 1.6, slither: 1.3 },
        toxic: { float: 1.3 }
    };

    const DEFAULT_PALETTE = { low: '#c8b47a', mid: '#4f8f3f', high: '#7a6a4a', peak: '#f2f2f2' };

    // --- words ------------------------------------------------------------------------------------

    const FACTS = [
        'It eats moonbeams for breakfast.',
        'It sleeps standing on its head.',
        'It collects shiny pebbles and gives them all names.',
        'It laughs whenever the wind blows.',
        'It hums when it is happy, which is always.',
        'It can count all the way to three.',
        'It has never been on time for anything.',
        'It loves a good nap in the sunshine.',
        'It thinks clouds are giant fluffy friends.',
        'It waves at every spaceship it sees.',
        'It keeps a tiny garden on its back.',
        'It sneezes glitter.',
        'It tells jokes, but nobody understands them.',
        'It does a little dance before every meal.',
        'It can balance a pebble on its nose for hours.',
        'It is very ticklish.',
        'Its favourite food is crunchy space lettuce.',
        'It sings to the stars every night.',
        'It once won a staring contest against a rock.',
        'It hiccups bubbles that smell like strawberries.',
        'It gives the best hugs on this planet.',
        'It is very good at hide and seek.',
        'It changes colour a little when it blushes.',
        'Its best friend is a cloud.',
        'It smiles even when it is asleep.',
        'It drinks dewdrops through a tiny straw.',
        'It lives in a cosy burrow lined with soft moss.',
        'It can hear a pin drop on the next planet.',
        'It counts sheep to fall asleep, but there are no sheep here.',
        'It was very excited to meet you.',
        'It thinks your spaceship is a big shiny friend.',
        'It pretends to be a rock when it feels shy.',
        'It eats its dinner backwards, pudding first.',
        'It snores like a tiny trumpet.',
        'It wears a puddle as a hat when it rains.',
        'It plays catch with its own shadow.',
        'It is the blinking champion of its whole world.',
        'It knits little socks for its friends.',
        'It always says thank you, in its own way.',
        'It likes to watch the sunset with its family.',
        'Its babies ride on its back until they are big enough to explore.',
        'It travels in a friendly herd that never leaves anyone behind.',
        'It can smell rain coming from a whole day away.',
        'It builds a new nest every spring, each one a little fancier.',
        'It greets its friends by bumping noses.'
    ];

    const TYPE_FACTS = {
        ice: ['It makes snow angels every morning.', 'It keeps warm by wiggling a lot.', 'It thinks snowballs are a kind of fruit.', 'It loves sliding down icy hills.', 'Its thick coat keeps it cosy in the snow.'],
        lava: ['It toasts marshmallows on its warm back.', 'Its feet are always nice and toasty.', 'It takes bubbly warm baths for fun.', 'It never needs a blanket.'],
        ocean: ['It surfs on the biggest waves.', 'It blows bubble rings to say hello.', 'It is friends with everything in the sea.', 'It loves splashing in the shallows.'],
        desert: ['It can go a whole year without a drink.', 'It builds sandcastles taller than itself.', 'It wears its shadow like a sun hat.', 'It loves a warm sandy nap.'],
        crystal: ['It sparkles when the sun comes out.', 'It plays tunes by tapping on crystals.', 'It polishes itself every morning.', 'It can see its reflection everywhere.'],
        toxic: ['It thinks the green fog smells lovely.', 'It blows the biggest green bubbles.', 'It likes the fizzy puddles best.'],
        gas: ['It has never once touched the ground.', 'It floats on warm winds all day long.', 'It sleeps inside a soft pink cloud.', 'It plays tag with the clouds.'],
        rock: ['It likes to roll in moon dust.', 'It can jump very high because it is so light here.', 'It thinks craters make cosy beds.'],
        earth: ['It loves rolling in the soft grass.', 'It splashes in every puddle it finds.', 'It likes to smell the flowers.']
    };

    const GLOW_FACTS = ['It glows in the dark like a night light.', 'It glows a little brighter when it giggles.', 'It lights the way home for its friends.'];

    const SOUNDS = ['blorp', 'meep meep', 'boop', 'wibble', 'squeak', 'pling', 'bloop bloop', 'wub wub', 'zoop', 'fweee',
        'mrrrp', 'ploink', 'pip pip', 'doo-wee', 'gloop', 'hmmmm', 'honk honk', 'bwip', 'yip yip', 'tweedle-dee', 'burble',
        'plip plop', 'zibble', 'nyoo', 'boing', 'peep peep', 'wheee', 'tra-la-la', 'flibber', 'oobly'];
    const SOUND_WHEN = ['', '', '', ' when it is happy', ' when it sees you', ' very quietly', ' all day long', ' when it wakes up'];

    const SIZE_WORDS = [[0.45, 'about as big as a cat'], [0.9, 'about as big as a dog'], [1.5, 'about as big as a pony'],
        [2.1, 'about as tall as a person'], [3, 'about as big as a car'], [4.2, 'about as big as an elephant'], [Infinity, 'about as big as a house']];

    const PACE = { hop: 0.9, walk: 0.7, crawl: 0.3, slither: 0.4, roll: 1.0, float: 0.45, drift: 0.35 };

    // --- colour -----------------------------------------------------------------------------------

    /** Relative luminance of an sRGB colour (0..1). */
    function lum(c) {
        const f = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    }

    /** A hue for each world type (natural, not candy), picked to stand out on its ground. */
    function baseHue(r, type, ground) {
        const gh = ground[0];
        switch (type) {
            case 'earth': return r.pick([[gh + 180 + r.range(-50, 50), 0.5, 0.52], [r.range(18, 40), 0.68, 0.52], [r.range(200, 228), 0.5, 0.5], [r.range(268, 300), 0.42, 0.5], [r.range(40, 52), 0.62, 0.58]]);
            case 'ocean': return r.pick([[r.range(4, 24), 0.66, 0.58], [r.range(170, 192), 0.55, 0.46], [r.range(200, 226), 0.58, 0.52], [r.range(44, 54), 0.72, 0.58], [r.range(285, 320), 0.45, 0.55]]);
            case 'desert': return r.pick([[r.range(12, 24), 0.55, 0.44], [r.range(200, 222), 0.34, 0.44], [r.range(330, 352), 0.45, 0.5], [r.range(38, 48), 0.7, 0.56], [r.range(160, 178), 0.4, 0.4]]);
            case 'ice': return r.pick([[r.range(205, 228), 0.5, 0.4], [r.range(16, 32), 0.75, 0.55], [r.range(330, 350), 0.55, 0.5], [r.range(262, 282), 0.42, 0.46], [r.range(160, 175), 0.45, 0.4]]);
            case 'lava': return r.pick([[r.range(0, 16), 0.55, 0.36], [r.range(24, 42), 0.85, 0.55], [r.range(268, 292), 0.35, 0.32], [r.range(200, 220), 0.25, 0.3]]);
            case 'crystal': return [gh + r.sign() * r.range(90, 150), r.range(0.55, 0.8), r.range(0.46, 0.58)];
            case 'toxic': return r.pick([[r.range(58, 88), 0.7, 0.5], [r.range(100, 140), 0.55, 0.42], [r.range(278, 310), 0.5, 0.48], [r.range(28, 42), 0.75, 0.55]]);
            case 'gas': return [r.range(0, 360), r.range(0.5, 0.72), r.range(0.52, 0.64)];
            case 'rock': return [r.range(0, 360), r.range(0.42, 0.65), r.range(0.46, 0.58)];
        }
        return [r.range(0, 360), 0.6, 0.55];
    }

    function colours(r, type, pal, glow) {
        const groundRgb = U.hex(pal.mid);
        const ground = U.toHsl(groundRgb);
        const b = baseHue(r, type, ground);
        let h = b[0], s = U.clamp(b[1] * r.range(0.85, 1.15), 0.18, 0.92), l = U.clamp(b[2] + r.range(-0.05, 0.05), 0.28, 0.7);
        // Low-vision friendly: never the same brightness as the ground it walks on.
        const gl = lum(groundRgb);
        for (let k = 0; k < 6 && Math.abs(lum(U.hsl(h, s, l)) - gl) < 0.14; k++) l = U.clamp(l + (gl > 0.25 ? -0.07 : 0.07), 0.2, 0.8);
        const scheme = r.weighted([['analogous', 3], ['complement', 3], ['split', 2], ['triad', 1.2]]);
        const off = scheme === 'analogous' ? r.sign() * r.range(28, 55) : scheme === 'complement' ? 180 + r.range(-15, 15) : scheme === 'split' ? r.sign() * r.range(140, 165) : r.sign() * 120;
        const main = U.hsl(h, s, l);
        const dark = U.hsl(h + r.range(-14, 14), U.clamp(s * 1.1, 0, 1), l * r.range(0.55, 0.7));
        const cream = U.mix([1, 0.97, 0.9], U.hex(pal.peak || '#f2f2f2'), 0.2);
        const belly = U.mix(U.hsl(h + r.range(-30, 30), s * 0.45, U.clamp(l + 0.26, 0.6, 0.88)), cream, r.range(0.25, 0.5));
        const accent = U.hsl(h + off, glow ? 0.95 : r.range(0.62, 0.88), glow ? 0.6 : r.range(0.5, 0.62));
        const iris = r.pick([[44, 0.9, 0.52], [32, 0.9, 0.5], [130, 0.6, 0.45], [178, 0.7, 0.42], [210, 0.75, 0.52], [275, 0.55, 0.55], [18, 0.75, 0.45], [0, 0, 0.18]]);
        const eye = r.pick(['#14141f', '#1a1426', '#101a22', '#1e1612']);
        return {
            main: U.toHex(main), dark: U.toHex(dark), belly: U.toHex(belly), accent: U.toHex(accent),
            iris: U.toHex(U.hsl(iris[0], iris[1], iris[2])), eye: eye, scheme: scheme
        };
    }

    // --- the spec -------------------------------------------------------------------------------

    function legsFor(r, body, move) {
        switch (body) {
            case 'jelly': return r.chance(0.85) ? [r.int(4, 8), 'tentacle'] : [0, 'tentacle'];
            case 'puff':
                if (move === 'walk') return [2, r.chance(0.6) ? 'stubby' : 'stick'];
                if (move === 'hop') return r.chance(0.5) ? [0, 'stubby'] : [2, 'stubby'];
                if (move === 'crawl') return [r.int(4, 8), 'tentacle'];
                return r.chance(0.35) ? [r.int(3, 6), 'tentacle'] : [0, 'tentacle'];
            case 'quad':
                if (move === 'crawl') return [r.pick([6, 8]), 'stubby'];
                return [r.weighted([[4, 6], [6, 1.2]]), r.chance(0.65) ? 'stick' : 'stubby'];
            case 'biped': return [2, r.chance(0.55) ? 'stick' : 'stubby'];
            case 'flat':
                if (move === 'hop') return [2, 'stubby'];
                if (move === 'crawl') return r.weighted([[[0, 'stubby'], 3], [[r.pick([6, 8]), 'stick'], 3.2], [[r.int(5, 8), 'tentacle'], 2.6]]);
                return [0, 'stubby'];
            case 'worm': return move === 'crawl' ? [r.pick([6, 8]), 'stubby'] : [0, 'stubby'];
            case 'shell':
                if (move === 'walk') return [4, 'stubby'];
                if (move === 'crawl') return r.chance(0.55) ? [6, 'stick'] : [0, 'stubby'];
                return [0, 'stubby'];
            case 'flyer': return move === 'walk' || move === 'hop' ? [2, 'stick'] : [0, 'stick'];
        }
        return [0, 'stubby'];
    }

    /** Which kind of animal a body plan becomes, from how it moves and its legs. */
    function variantFor(r, body, move, legs, legKind, type) {
        switch (body) {
            case 'puff': return move === 'float' ? (r.chance(0.5) ? 'balloon' : 'fluff') : r.weighted([['fluff', 3], ['smooth', 2.5], ['pear', 2]]);
            case 'quad': return move === 'crawl' ? 'crawler' : r.weighted([['grazer', 2.6], ['stocky', 2.4], ['lithe', 2.2], ['pup', 2.4]]);
            case 'biped': return r.weighted([['dino', 2.5], ['upright', 2.5], ['hopper', move === 'hop' ? 3 : 0.8]]);
            case 'flat':
                if (move === 'hop') return 'frog';
                if (move === 'float' || move === 'drift') return 'ray';
                if (legs === 0) return 'slug';
                return legKind === 'tentacle' ? 'octo' : 'crab';
            case 'worm': return move === 'crawl' ? 'caterpillar' : 'noodle';
            case 'jelly': return type === 'gas' && r.chance(0.5) ? 'balloon' : r.chance(0.75) ? 'bell' : 'siphon';
            case 'shell':
                if (move === 'walk') return 'tortoise';
                if (move === 'roll') return 'pillbug';
                return legs > 0 ? 'beetle' : 'snail';
            case 'flyer':
                if (move === 'walk' || move === 'hop') return 'bird';
                return r.weighted([['bird', 2.5], ['moth', 2.5], ['bat', 1.6]]);
        }
        return 'plain';
    }

    function sizeFor(r, type, body, variant) {
        let bands = [[[0.3, 0.6], 3], [[0.6, 1.2], 4], [[1.2, 2.2], 3], [[2.2, 4], 1.4], [[4, 6], 0.5]];
        if (type === 'rock') bands = [[[0.3, 0.6], 4], [[0.6, 1.2], 3]];
        else if (type === 'gas') bands = [[[1.5, 3], 3], [[3, 6], 2]];
        else if (body === 'jelly') bands = [[[0.5, 1.2], 2], [[1.2, 2.5], 3], [[2.5, 5], 2]];
        else if (body === 'worm' || variant === 'snail' || variant === 'beetle' || variant === 'pillbug') bands = [[[0.3, 0.6], 4], [[0.6, 1.2], 3], [[1.2, 2.5], 1]];
        else if (body === 'flyer') bands = [[[0.3, 0.6], 3], [[0.6, 1.2], 3], [[1.2, 2.5], 2], [[2.5, 4], 0.6]];
        const b = r.weighted(bands);
        return Math.round(U.clamp(r.range(b[0], b[1]), 0.3, 6) * 100) / 100;
    }

    function sizeWordsFor(size) {
        for (const w of SIZE_WORDS) if (size < w[0]) return w[1];
        return SIZE_WORDS[SIZE_WORDS.length - 1][1];
    }

    function moveWordsFor(r, s, type) {
        const v = s.variant;
        switch (s.move) {
            case 'walk':
                if (v === 'bird') return r.pick(['It struts about on two thin legs.', 'It walks with a proud little bob of its head.']);
                if (v === 'tortoise') return r.pick(['It plods along, very slowly and very happily.', 'It takes its time, one careful step at a time.']);
                if (v === 'grazer') return r.pick(['It wanders about, nibbling as it goes.', 'It strolls along on its long legs.']);
                if (s.legs === 2) return r.pick(['It waddles about.', 'It walks on two legs.', 'It toddles along.']);
                if (s.legs >= 6) return r.pick(['It walks on lots of legs.', 'It trots along on all its legs.']);
                return r.pick(['It trots along.', 'It strolls about.', 'It ambles along.']);
            case 'crawl':
                if (v === 'snail' || v === 'slug') return r.pick(['It glides along very slowly.', 'It inches along, leaving a shiny trail.']);
                if (v === 'octo') return r.pick(['It wiggles along on its tentacles.', 'It crawls on its wiggly arms.']);
                if (v === 'crab') return r.pick(['It scuttles sideways.', 'It tiptoes along on its many legs.']);
                if (v === 'beetle') return r.pick(['It trundles along under its shiny shell.', 'It bustles about on six little legs.']);
                if (v === 'caterpillar') return r.pick(['It ripples along on lots of little feet.', 'It inches along, one bump at a time.']);
                if (s.legKind === 'tentacle') return r.pick(['It wiggles along on its tentacles.', 'It crawls on its wiggly arms.']);
                return r.pick(['It crawls.', 'It scuttles along on lots of little feet.', 'It shuffles about.']);
            case 'hop':
                if (v === 'frog') return r.pick(['It hops on its big springy back legs.', 'It leaps from place to place.']);
                if (v === 'hopper') return r.pick(['It bounds along on its big feet.', 'It hops like a kangaroo.']);
                if (v === 'bird') return r.pick(['It hops about, looking for snacks.', 'It bounces along on two thin legs.']);
                if (s.legs === 2) return r.pick(['It hops on two springy legs.', 'It hops.', 'It bounces along.']);
                return r.pick(['It hops.', 'It bounces along like a ball.', 'It boings around.']);
            case 'roll': return r.pick(['It curls up into a ball and rolls.', 'It rolls everywhere it goes.', 'It rolls around like a beach ball.']);
            case 'slither': return r.pick(['It wiggles along.', 'It slithers.', 'It wriggles about.']);
            case 'float':
                if (v === 'ray') return r.pick(['It glides through the air like a kite.', 'It floats on its wide soft fins.']);
                if (v === 'balloon') return r.pick(['It floats like a balloon.', 'It drifts up high like a hot air balloon.']);
                if (s.wings) return r.pick(['It hovers on soft wings.', 'It glides about on its wings.']);
                if (type === 'ocean') return r.pick(['It floats.', 'It floats along like a bubble.', 'It bobs gently up and down.']);
                return r.pick(['It floats.', 'It floats like a balloon.', 'It bobs gently up and down.']);
            case 'drift':
                if (v === 'moth') return r.pick(['It flutters about on big soft wings.', 'It flits from place to place.']);
                if (v === 'ray') return r.pick(['It ripples its fins and drifts along.', 'It sails along on the breeze.']);
                if (s.wings) return r.pick(['It flutters along on little wings.', 'It flaps along.']);
                return r.pick(['It drifts along.', 'It drifts on the breeze.']);
        }
        return 'It wanders about.';
    }

    /**
     * What a creature is, from its seed and the world it lives on. Deterministic: the
     * same seed on the same kind of world always gives exactly the same creature.
     */
    function spec(seed, world) {
        seed = seed >>> 0;
        const type = (world && world.type && BODY_BY_TYPE[world.type]) ? world.type : 'earth';
        const pal = (world && world.palette) || DEFAULT_PALETTE;
        const r = U.rng(U.hash('creature', seed, type));

        const body = r.weighted(BODY_BY_TYPE[type]);
        let move;
        if (type === 'gas' || body === 'jelly') move = body === 'flyer' ? r.weighted([['drift', 3], ['float', 2]]) : (r.chance(0.5) ? 'float' : 'drift');
        else {
            const mod = MOVE_MOD[type] || {};
            move = r.weighted(MOVE_BY_BODY[body].map(p => [p[0], p[1] * (mod[p[0]] || 1)]));
        }
        if (type === 'gas' && body === 'puff') move = 'float';
        const lk = legsFor(r, body, move);
        const legs = lk[0], legKind = lk[1];
        const variant = variantFor(r, body, move, legs, legKind, type);

        const eyes = variant === 'moth' || variant === 'bird' ? 2 : r.weighted([[2, 9], [1, 1.1], [3, 1.1], [4, 1.4]]);
        const stalky = { slug: 0.75, snail: 0.85, crab: 0.55, octo: 0.15 }[variant];
        const eyeStalks = r.chance(stalky === undefined ? (body === 'worm' ? 0.12 : 0.03) : stalky);
        let antennae = r.weighted([[0, 6], [1, 1.1], [2, 2.4], [3, 0.3]]);
        if (variant === 'moth' || variant === 'beetle' || variant === 'caterpillar') antennae = 2;
        if (eyeStalks || variant === 'bird' || variant === 'tortoise' || variant === 'ray') antennae = 0;
        const antennaKind = variant === 'moth' ? 'feather' : r.weighted([['bobble', 3], ['curl', 1.5], ['feather', 1]]);
        const furry = ['quad', 'biped', 'puff'].indexOf(body) >= 0 || variant === 'bat';
        const ears = furry && variant !== 'balloon' && r.chance(type === 'ice' ? 0.75 : variant === 'bat' ? 1 : 0.5);
        const earKind = variant === 'bat' ? 'tall' : r.weighted([['leaf', 3], ['round', 2.5], ['tall', 1.5], ['floppy', 1.5], ['fan', type === 'ocean' ? 2.5 : 0.8]]);
        const tailP = { quad: 0.85, biped: variant === 'upright' ? 0.25 : 1, puff: 0.3, flyer: variant === 'bird' ? 1 : 0, flat: variant === 'ray' ? 1 : 0, shell: variant === 'tortoise' ? 0.8 : 0 }[body] || 0;
        const tail = r.chance(tailP);
        const tailKind = variant === 'ray' ? 'whip' : variant === 'bird' ? 'fan' : r.weighted([['taper', 3], ['fluffy', 2.2], ['club', 1.2], ['fin', type === 'ocean' ? 2 : 0.4], ['curl', 1.2]]);
        const wings = body === 'flyer' || (body === 'puff' && move === 'float' && variant !== 'balloon' && r.chance(0.8));
        const wingKind = variant === 'moth' ? 'bug' : variant === 'bat' ? 'membrane' : 'feather';
        const crest = r.weighted([['none', 5], ['fin', body === 'quad' || body === 'biped' || variant === 'noodle' ? 1.5 : 0.3], ['plates', body === 'quad' || variant === 'dino' ? 1.4 : 0],
            ['tufts', type === 'ice' ? 2.5 : furry ? 1 : 0], ['crystals', type === 'crystal' ? 4 : 0], ['leaves', type === 'earth' || type === 'ocean' ? 1.4 : 0], ['bumps', 0.8]]);
        const glow = r.chance({ lava: 0.65, toxic: 0.6, crystal: 0.55, ocean: 0.12, gas: 0.2 }[type] || 0);
        const horns = r.weighted([['none', 6], ['nubs', furry ? 1.6 : 0.4], ['antlers', variant === 'grazer' || variant === 'lithe' ? 1.4 : 0], ['crest', variant === 'dino' || variant === 'bird' ? 1.6 : 0.3],
            ['tuft', furry ? 1.3 : 0], ['lure', glow && (type === 'ocean' || type === 'toxic' || body === 'flat' || body === 'puff') ? 2 : 0]]);
        const snout = variant === 'bird' ? 'beak' : r.weighted([['none', body === 'puff' || body === 'worm' || body === 'flat' || body === 'jelly' ? 6 : 1],
            ['muzzle', body === 'quad' || body === 'biped' || variant === 'tortoise' ? 5 : 0.6], ['beak', variant === 'dino' || variant === 'upright' ? 1.2 : body === 'puff' ? 0.8 : 0.2],
            ['long', variant === 'grazer' || variant === 'lithe' || variant === 'crawler' ? 1.2 : 0]]);
        const pattern = r.weighted([['plain', 2.2], ['spots', 3], ['stripes', 2.4], ['patches', 1.6], ['saddle', 1.5], ['mask', furry ? 1.4 : 0.3], ['rings', 1], ['speckles', 1.3]]);
        const eyeStyle = r.weighted([['round', 4], ['sleepy', 1.6], ['bright', 2]]);
        const colors = colours(r, type, pal, glow);
        const size = sizeFor(r, type, body, variant);

        const s = {
            seed: seed,
            name: NSE.Universe.creatureName(seed),
            worldType: type,
            body: body,
            variant: variant,
            legs: legs,
            legKind: legKind,
            eyes: eyes,
            eyeStalks: eyeStalks,
            eyeStyle: eyeStyle,
            antennae: antennae,
            antennaKind: antennaKind,
            ears: ears,
            earKind: earKind,
            tail: tail,
            tailKind: tailKind,
            wings: wings,
            wingKind: wingKind,
            crest: crest,
            horns: horns,
            snout: snout,
            colors: colors,
            pattern: pattern,
            glow: glow,
            size: size,
            sizeWords: sizeWordsFor(size),
            move: move,
            moveWords: '',
            /** A comfortable wandering speed in metres per second, for the caller. */
            pace: Math.round(PACE[move] * Math.sqrt(size) * 100) / 100,
            fact: '',
            sound: ''
        };
        s.moveWords = moveWordsFor(r, s, type);
        const tf = TYPE_FACTS[type];
        if (glow && r.chance(0.3)) s.fact = r.pick(GLOW_FACTS);
        else if (tf && r.chance(0.35)) s.fact = r.pick(tf);
        else s.fact = r.pick(FACTS);
        s.sound = 'It goes "' + r.pick(SOUNDS) + '"' + r.pick(SOUND_WHEN) + '.';
        return s;
    }

    /** The scanner's lines, in reading order. */
    function words(s) {
        return [
            'This is a ' + s.name + '.',
            'It is ' + s.sizeWords + '.',
            s.moveWords,
            s.fact,
            s.sound
        ];
    }

    // --- a civilisation's people --------------------------------------------------------------------

    /**
     * How the people of a civilisation look: shared by the scanner's 3D model and the face on an
     * alien call, so the person who rings you is one of the people the scanner shows.
     */
    function peopleLook(seed, type) {
        seed = seed >>> 0;
        const r = U.rng(U.hash('people-look', seed));
        // Skin is always a clearly alien colour (lime green round through blue and purple to pink),
        // never the tans and browns of human skin: on a public game a human-skinned cartoon face
        // can read as a caricature of real people.
        const hue = 75 + r.range(0, 260);
        const skinPick = r.weighted([['bold', 3], ['soft', 2.5]]);
        const sk = skinPick === 'bold' ? [hue, r.range(0.48, 0.72), r.range(0.48, 0.6)] : [hue, r.range(0.42, 0.58), r.range(0.6, 0.72)];
        const skin = U.hsl(sk[0], sk[1], sk[2]);
        const outfitHue = sk[0] + r.pick([180, 150, -150, 120, -120, 30, -30]) + r.range(-12, 12);
        const outfit = U.hsl(outfitHue, r.range(0.45, 0.75), r.range(0.32, 0.48));
        const trim = r.chance(0.5) ? U.hsl(r.range(40, 52), 0.85, 0.6) : U.hsl(outfitHue + r.pick([150, 180, 210]), 0.75, 0.62);
        const iris = U.hsl(r.pick([45, 30, 130, 180, 210, 280, 320]), 0.8, 0.5);
        return {
            seed: seed,
            skin: U.toHex(skin),
            dark: U.toHex(U.hsl(sk[0] + r.range(-15, 15), Math.min(1, sk[1] * 1.15), sk[2] * 0.62)),
            belly: U.toHex(U.mix(U.hsl(sk[0], sk[1] * 0.4, Math.min(0.9, sk[2] + 0.22)), [1, 0.97, 0.92], 0.35)),
            accent: U.toHex(U.hsl(sk[0] + r.sign() * r.range(30, 60), 0.75, 0.55)),
            spots: U.toHex(U.hsl(sk[0] + r.range(-25, 25), Math.min(1, sk[1] * 1.2), sk[2] * 0.72)),
            iris: U.toHex(iris),
            outfit: U.toHex(outfit),
            trim: U.toHex(trim),
            eyes: r.weighted([[2, 8], [1, 1.4], [3, 1.6], [4, 0.8]]),
            eyeShape: r.weighted([['round', 4], ['oval', 3], ['almond', 2]]),
            ears: r.weighted([['none', 3], ['pointy', 2.5], ['round', 2], ['fins', 1.5], ['long', 1.2]]),
            antennae: r.weighted([[0, 4], [1, 1.5], [2, 2.5]]),
            antKind: r.weighted([['bobble', 3], ['curl', 1.5], ['feather', 1.2]]),
            head: r.weighted([['round', 3], ['tall', 2], ['wide', 2], ['pear', 1.6], ['bean', 1.4], ['dome', 1.6], ['heart', 1]]),
            headTop: r.weighted([['none', 4], ['crest', 1.5], ['tuft', 1.6], ['nubs', 1.4], ['ridge', 1]]),
            headgear: r.weighted([['none', 4], ['headset', 2], ['bubble', 1.3], ['band', 1.5], ['cap', 1.2]]),
            collar: r.weighted([['round', 3], ['high', 2], ['v', 1.5], ['ruff', 1]]),
            nose: r.weighted([['none', 3], ['dots', 2.5], ['button', 2], ['snout', 1]]),
            pattern: r.weighted([['plain', 3], ['freckles', 2], ['spots', 1.6], ['stripes', 1.2], ['mask', 1]]),
            cheeks: r.chance(0.45),
            arms: r.weighted([[2, 8], [4, 1]]),
            bg: r.weighted([['window', 3], ['bridge', 3], ['garden', 1.6], ['stars', 1.4]]),
            bgHue: hue + r.range(150, 210),
            type: type || 'earth'
        };
    }

    // --- the model ------------------------------------------------------------------------------

    const QUALITY = { high: 1, standard: 0.72, low: 0.48 };
    const TRI_CAP = { high: 2500, standard: 1700, low: 1400 };

    /**
     * A model of a creature. Origin at its feet (floaters hover above it), facing -Z,
     * height = spec.size metres. update(dt, t, moving) animates its parts only.
     */
    function build(THREE, s, detail) {
        detail = QUALITY[detail] ? detail : 'standard';
        let q = QUALITY[detail], out = null;
        for (let k = 0; k < 7; k++) {
            out = assemble(THREE, s, q);
            if (out.tris <= TRI_CAP[detail] || q <= 0.16) break;
            out.api.dispose();
            q = Math.max(0.16, q - 0.12);
        }
        out.api.triangles = out.tris;
        return out.api;
    }

    /** sRGB 0..1 to linear (vertex colours are linear in three's colour management). */
    function toLin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

    function assemble(THREE, s, q) {
        const V = THREE.Vector3;
        const R = U.rng(U.hash('creature-build', s.seed));
        const N = U.noise3(U.hash('creature-skin', s.seed));
        const geos = [], mats = [];
        let tris = 0;
        const seg = (n, min) => Math.max(Math.max(3, Math.round((min || 3) * 0.6)), Math.round(n * q));
        const UP = new V(0, 1, 0), NEG_Z = new V(0, 0, -1);
        const person = !!s.people;
        const look = person ? peopleLook(s.seed, s.worldType) : null;
        const B = person ? 'person' : s.body, VAR = person ? 'person' : (s.variant || 'plain');

        // --- colours (sRGB arrays) ---
        const C = person ? { main: look.skin, dark: look.dark, belly: look.belly, accent: look.accent, iris: look.iris, eye: '#14141f' } : s.colors;
        const CL = { main: U.hex(C.main), dark: U.hex(C.dark || C.main), belly: U.hex(C.belly), accent: U.hex(C.accent) };
        CL.deep = U.mix(CL.dark, [0.05, 0.05, 0.08], 0.35);
        CL.horn = U.mix([0.95, 0.9, 0.8], CL.belly, 0.3);
        CL.pink = U.mix([1, 0.62, 0.7], CL.main, 0.25);
        if (person) { CL.outfit = U.hex(look.outfit); CL.trim = U.hex(look.trim); CL.spots = U.hex(look.spots); }

        // --- materials (shared by every part of this one creature; made when first needed) ---
        const flat = s.worldType === 'crystal' && !person;
        const M = {};
        function mat(name) {
            if (M[name]) return M[name];
            let m;
            switch (name) {
                case 'skin': m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat }); if (s.glow) { m.emissive = new THREE.Color(C.main); m.emissiveIntensity = 0.1; } break;
                case 'white': m = new THREE.MeshBasicMaterial({ color: '#f4f5fa' }); break;
                case 'iris': m = new THREE.MeshBasicMaterial({ color: C.iris || '#c08a2a' }); break;
                case 'pupil': m = new THREE.MeshBasicMaterial({ color: C.eye || '#14141f' }); break;
                case 'mouth': m = new THREE.MeshLambertMaterial({ color: '#3a1a2a' }); break;
                case 'glow': m = new THREE.MeshLambertMaterial({ color: C.accent, emissive: C.accent, emissiveIntensity: 0.9 }); break;
                case 'film': m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }); break;
                case 'sheet': m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: flat }); break;
            }
            mats.push(m); M[name] = m; return m;
        }
        /** Glowing bits use the glow material when the creature glows, else plain painted skin. */
        const shine = s.glow ? 'glow' : 'skin';

        // --- joints: groups placed at a rest point in rig space; parts are built in rig space ---
        const group = new THREE.Group();
        group.name = 'creature';
        const root = new THREE.Group(); root.name = 'body';
        const rig = new THREE.Group();
        const pivot = new THREE.Group();
        group.add(root); root.add(rig); rig.add(pivot);
        pivot.userData.w = new V(0, 0, 0);
        const jointList = [pivot];
        function joint(parent, p) {
            const g = new THREE.Group();
            g.userData.w = p.clone();
            const pw = parent.userData.w;
            g.position.set(p.x - pw.x, p.y - pw.y, p.z - pw.z);
            parent.add(g);
            jointList.push(g);
            return g;
        }
        /** Parts waiting to be merged: joint -> material name -> [geometries in rig space]. */
        const pending = new Map();
        function put(j, geo, mname) {
            if (!pending.has(j)) pending.set(j, {});
            const bucket = pending.get(j);
            (bucket[mname] = bucket[mname] || []).push(geo);
            return geo;
        }

        // --- geometry helpers (all return geometry in rig space) ---
        const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V();
        function place(g, pos, quat, scale) {
            _m.compose(pos || new V(), quat || _q.identity(), scale || _s.set(1, 1, 1));
            g.applyMatrix4(_m);
            return g;
        }
        /** Average normals of vertices that share a position (sphere seams), after deforming. */
        function smoothSeams(g) {
            g.computeVertexNormals();
            const p = g.attributes.position, n = g.attributes.normal, map = new Map();
            for (let i = 0; i < p.count; i++) {
                const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
                const e = map.get(k);
                if (e) e.push(i); else map.set(k, [i]);
            }
            const t = new V();
            map.forEach(function (list) {
                if (list.length < 2) return;
                t.set(0, 0, 0);
                for (const i of list) t.x += n.getX(i), t.y += n.getY(i), t.z += n.getZ(i);
                t.normalize();
                for (const i of list) n.setXYZ(i, t.x, t.y, t.z);
            });
            return g;
        }
        /**
         * An ellipsoid at c with radii r, nose toward -Z. o.taper(t) scales x,y along z (t -1 front .. 1 back);
         * o.vtaper(t) scales x,z along y (t -1 bottom .. 1 top); o.bump = fur lumpiness; o.quat rotates it;
         * o.cap = polar angle for a dome (top part only).
         */
        function ell(c, r, o) {
            o = o || {};
            const ws = o.ws || seg(20, 8), hs = o.hs || seg(14, 6);
            const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, o.cap || Math.PI);
            const p = g.attributes.position;
            const bf = o.bumpF || 5.5;
            for (let i = 0; i < p.count; i++) {
                let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
                if (o.taper) { const k = o.taper(z); x *= k; y *= k; }
                if (o.vtaper) { const k = o.vtaper(y); x *= k; z *= k; }
                if (o.bump) { const k = 1 + o.bump * N(x * bf + 3.1, y * bf + 7.7, z * bf + 1.3); x *= k; y *= k; z *= k; }
                x *= r[0]; y *= r[1]; z *= r[2];
                if (o.bend) y += o.bend(z / r[2]) * r[1];
                p.setXYZ(i, x, y, z);
            }
            smoothSeams(g);
            return place(g, new V(c[0], c[1], c[2]), o.quat || null);
        }
        /** A tapered tube from a to b (radii ra, rb), with a ball at b (and at a when capA). */
        function limb(a, b, ra, rb, o) {
            o = o || {};
            const d = new V().subVectors(b, a), len = Math.max(1e-4, d.length());
            const radial = o.radial || seg(8, 4);
            const g = new THREE.CylinderGeometry(rb, ra, len, radial, 1, true);
            g.translate(0, len / 2, 0);
            place(g, a, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
            const out = [g];
            if (o.capB !== false) { const e = new THREE.SphereGeometry(rb, radial, Math.max(3, Math.round(radial * 0.5))); e.translate(b.x, b.y, b.z); out.push(e); }
            if (o.capA) { const e = new THREE.SphereGeometry(ra, radial, Math.max(3, Math.round(radial * 0.5))); e.translate(a.x, a.y, a.z); out.push(e); }
            return out;
        }

        // --- painting: vertex colours from where each vertex is on the body ---
        /** Where the body is: its centre and radii, set by the body plan (patterns are sized to it). */
        const T = { c: new V(0, 0.5, 0), r: new V(0.4, 0.4, 0.5), upright: false };
        const pat = s.pattern || 'plain';
        const spotPts = [];
        if (pat === 'spots' || pat === 'speckles') {
            const n = pat === 'spots' ? R.int(9, 16) : 0;
            for (let k = 0; k < n; k++) spotPts.push([R.range(-1.2, 1.2), R.range(-0.4, 1.3), R.range(-1.3, 1.3), R.range(0.18, 0.32)]);
        }
        const stripeF = R.range(3.2, 5.2), stripeW = R.range(0.38, 0.5), patF = R.range(1.6, 2.6);
        const stripeCol = R.chance(0.5) ? 'dark' : 'accent', patchCol = R.chance(0.6) ? 'accent' : 'dark';
        const sockP = R.chance(0.45);
        const tmp = [0, 0, 0];
        function mixInto(out, c, k) { out[0] += (c[0] - out[0]) * k; out[1] += (c[1] - out[1]) * k; out[2] += (c[2] - out[2]) * k; }
        /** Body colour at p (rig space) with surface normal n: countershading, then the pattern. */
        function bodyCol(p, n, out, o) {
            o = o || {};
            const ux = (p.x - T.c.x) / T.r.x, uy = (p.y - T.c.y) / T.r.y, uz = (p.z - T.c.z) / T.r.z;
            out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2];
            // A darker back, a pale belly (and a pale front on upright bodies).
            const back = U.smooth((uy * 0.6 + n.y * 0.6 - 0.15) / 0.7);
            mixInto(out, CL.dark, back * 0.55);
            let bel = U.smooth((-uy * 0.7 - n.y * 0.6 - 0.05) / 0.5);
            if (T.upright) bel = Math.max(bel, U.smooth((-n.z * 0.9 - 0.25) / 0.4) * U.smooth((0.55 - uy) / 0.5) * U.smooth((0.8 - Math.abs(ux)) / 0.4));
            if (o.noBelly) bel = 0;
            const k = o.belly !== undefined ? o.belly : bel;
            mixInto(out, CL.belly, k);
            if (o.plain) return out;
            const dorsal = 1 - k;
            const px = ux * T.r.x * 2.5, py = uy * T.r.y * 2.5, pz = uz * T.r.z * 2.5;
            const wob = N(px * 1.7, py * 1.7, pz * 1.7);
            if (pat === 'spots') {
                for (const sp of spotPts) {
                    const dx = ux - sp[0], dy = uy - sp[1], dz = uz - sp[2];
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + wob * 0.06;
                    if (d < sp[3]) { mixInto(out, CL.accent, U.smooth((sp[3] - d) / 0.06) * dorsal); break; }
                }
            } else if (pat === 'stripes') {
                const a = T.upright ? uy * 0.8 + ux * 0.15 : uz + ux * 0.1;
                const f = (a * stripeF * 0.5 + wob * 0.35) % 1, ff = f < 0 ? f + 1 : f;
                if (ff < stripeW) mixInto(out, CL[stripeCol], U.smooth(Math.min(ff, stripeW - ff) / 0.06) * dorsal * 0.9);
            } else if (pat === 'patches') {
                const v = N.fbm(px * patF * 0.4 + 11, py * patF * 0.4, pz * patF * 0.4, 3);
                if (v > 0.12) mixInto(out, CL[patchCol], U.smooth((v - 0.12) / 0.08) * dorsal * 0.9);
            } else if (pat === 'saddle') {
                const v = U.smooth((uy - 0.2 + wob * 0.15) / 0.2) * U.smooth((0.85 - Math.abs(uz)) / 0.3);
                mixInto(out, CL.accent, v * 0.85);
            } else if (pat === 'speckles') {
                const v = N(px * 7.5 + 40, py * 7.5, pz * 7.5);
                if (v > 0.42) mixInto(out, CL.deep, U.smooth((v - 0.42) / 0.05) * dorsal * 0.8);
            } else if (pat === 'rings' && o.limbT !== undefined) {
                const f = (o.limbT * 3.5) % 1;
                if (f < 0.45) mixInto(out, CL.dark, 0.7);
            }
            return out;
        }
        /** Paint a geometry with fn(p, n, out) -> sRGB, written as linear vertex colours. */
        function paint(g, fn) {
            const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
            const pv = new V(), nv = new V(), out = [0, 0, 0];
            for (let i = 0; i < p.count; i++) {
                pv.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i);
                fn(pv, nv, out);
                col[i * 3] = toLin(U.clamp(out[0], 0, 1)); col[i * 3 + 1] = toLin(U.clamp(out[1], 0, 1)); col[i * 3 + 2] = toLin(U.clamp(out[2], 0, 1));
            }
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            return g;
        }
        const paintBody = (g, o) => paint(g, (p, n, out) => bodyCol(p, n, out, o));
        const paintSolid = (g, c, shade) => paint(g, function (p, n, out) {
            out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
            if (shade) mixInto(out, CL.deep, U.smooth((-n.y - 0.2) / 0.8) * shade);
        });
        /** A limb from a to b: body colour near the body, then socks / dark toes / rings toward the tip. */
        function paintLimb(g, a, b, o) {
            o = o || {};
            const d = new V().subVectors(b, a), L2 = Math.max(1e-6, d.lengthSq()), w = new V();
            return paint(g, function (p, n, out) {
                const t = U.clamp(w.subVectors(p, a).dot(d) / L2, 0, 1.2);
                const lt = (o.t0 || 0) + t * ((o.t1 === undefined ? 1 : o.t1) - (o.t0 || 0));
                bodyCol(p, n, out, { limbT: lt, belly: o.belly });
                if (o.tip) mixInto(out, CL[o.tip], U.smooth((lt - (o.tipFrom || 0.7)) / 0.15));
                if (o.sock && sockP) mixInto(out, CL.belly, U.smooth((lt - 0.62) / 0.08) * 0.9);
            });
        }

        // --- surfaces: where a part goes on an ellipsoid, and which way it faces ---
        function surf(c, r) {
            return {
                c: c, r: r, size: (r.x + r.y) / 2,
                at: function (az, el, push) {
                    az *= Math.PI / 180; el *= Math.PI / 180;
                    const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = -Math.cos(az) * Math.cos(el);
                    const t = 1 / Math.sqrt((dx / r.x) ** 2 + (dy / r.y) ** 2 + (dz / r.z) ** 2);
                    const nrm = new V(dx * t / (r.x * r.x), dy * t / (r.y * r.y), dz * t / (r.z * r.z)).normalize();
                    const pt = new V(c.x + dx * t, c.y + dy * t, c.z + dz * t);
                    if (push) pt.addScaledVector(nrm, push);
                    return { p: pt, n: nrm };
                }
            };
        }

        // Animation handles.
        const A = { legs: [], tents: [], ants: [], ears: [], wings: [], lids: [], stalks: [], segs: [], tail: [], arms: [], fins: [], neck: null, head: null, spin: null, wave: null, bob: [] };
        const MOVE = person ? 'walk' : s.move;
        const floaty = MOVE === 'float' || MOVE === 'drift';
        const blinkEvery = R.range(2.8, 5.5);

        // ==== the head (shared by every plan): eyes with lids, muzzle / beak, mouth, ears, top ====
        /**
         * j = the joint the head belongs to; hc, hr = its centre and radii (V); o: { eyes, eyeR,
         * spread (azimuth of a pair), el (eye height), faceOnly (a body that is its own head),
         * snout, noMouth }.
         */
        function makeHead(j, hc, hr, o) {
            o = o || {};
            const H = surf(hc, hr);
            if (!o.faceOnly) put(j, paintBody(ell([hc.x, hc.y, hc.z], [hr.x, hr.y, hr.z], { ws: seg(18, 8), hs: seg(13, 6), bump: o.bump })), 'skin');
            const fs = Math.min(hr.x, hr.y);
            const n = o.eyes || s.eyes || 2;
            const er0 = fs * (o.eyeR || (n === 1 ? 0.38 : n === 2 ? 0.3 : n === 3 ? 0.24 : 0.22));
            const spread = o.spread || (n === 1 ? 0 : R.range(24, 38));
            const el = o.el === undefined ? R.range(10, 22) : o.el;
            let layout;
            if (n === 1) layout = [[0, el + 4, 1]];
            else if (n === 2) layout = [[-spread, el, 1], [spread, el, 1]];
            else if (n === 3) layout = [[-spread, el - 2, 1], [spread, el - 2, 1], [0, el + 28, 0.72]];
            else layout = [[-spread, el - 4, 1], [spread, el - 4, 1], [-spread * 0.55, el + 26, 0.62], [spread * 0.55, el + 26, 0.62]];
            const style = o.style || s.eyeStyle || 'round';
            const lidRest = style === 'sleepy' ? 0.42 : style === 'bright' ? 1.15 : 0.82;   // radians the lid sits back
            const irisK = style === 'bright' ? 0.72 : 0.62;
            let lowest = 90;
            layout.forEach(function (e, i) {
                const er = er0 * e[2];
                let centre, lookDir, base = j;
                if (o.stalks) {
                    const st = H.at(e[0] * 0.9, 62);
                    const top = st.p.clone().add(new V(e[0] / 60 * fs * 0.5, fs * R.range(0.75, 1.0), -fs * 0.1));
                    const sj = joint(j, st.p);
                    limb(st.p, top, er * 0.3, er * 0.26, { capB: false }).forEach(g => put(sj, paintLimb(g, st.p, top), 'skin'));
                    A.stalks.push({ j: sj, phase: i * 1.7 });
                    base = sj;
                    centre = top.clone().add(new V(0, er * 0.75, 0));
                    lookDir = new V(e[0] / 90, 0.1, -1).normalize();
                } else {
                    const at = H.at(e[0], e[1]);
                    centre = at.p.clone().addScaledVector(at.n, -er * 0.38);
                    lookDir = at.n.clone().multiplyScalar(0.55).add(new V(0, 0.05, -1)).normalize();
                }
                const qq = new THREE.Quaternion().setFromUnitVectors(NEG_Z, lookDir);
                const wc = new THREE.SphereGeometry(er, seg(14, 7), seg(6, 3), 0, Math.PI * 2, 0, Math.PI * 0.62);
                wc.rotateX(-Math.PI / 2);
                put(base, place(wc, centre, qq), 'white');
                const ic = new THREE.SphereGeometry(er * 1.012, seg(14, 7), 2, 0, Math.PI * 2, 0, irisK);
                ic.rotateX(-Math.PI / 2);
                put(base, place(ic, centre, qq), 'iris');
                const pc = new THREE.SphereGeometry(er * 1.022, seg(12, 6), 2, 0, Math.PI * 2, 0, irisK * 0.52);
                pc.rotateX(-Math.PI / 2);
                put(base, place(pc, centre, qq), 'pupil');
                const sh = new V(0.42, 0.42, -0.8).normalize().applyQuaternion(qq);
                put(base, place(new THREE.SphereGeometry(er * 0.2, seg(7, 4), seg(4, 3)), centre.clone().addScaledVector(sh, er * 1.0)), 'white');
                if (q > 0.6) put(base, place(new THREE.SphereGeometry(er * 0.09, 5, 3), centre.clone().addScaledVector(new V(-0.3, -0.25, -0.92).normalize().applyQuaternion(qq), er * 1.01)), 'white');
                // The lid: a hemisphere of skin over the top of the eye; blinking turns it down over the front.
                const lj = joint(base, centre);
                const lid = new THREE.SphereGeometry(er * 1.09, seg(14, 7), seg(5, 3), 0, Math.PI * 2, 0, Math.PI / 2);
                place(lid, centre, qq);
                put(lj, paintSolid(lid, U.mix(CL.main, CL.dark, 0.35)), 'skin');
                const right = new V(1, 0, 0).applyQuaternion(qq);
                A.lids.push({ j: lj, axis: right, rest: lidRest, off: i * 0.05 });
                if (!o.stalks) lowest = Math.min(lowest, e[1]);
            });
            if (o.stalks) lowest = 18;

            // Snout: a soft muzzle with a nose, a long nose, or a beak.
            const snout = o.snout !== undefined ? o.snout : s.snout;
            let mouthAt = null;
            if (snout === 'muzzle' || snout === 'long') {
                const long = snout === 'long';
                const at = H.at(0, lowest - 26);
                const mr = new V(fs * (long ? 0.32 : 0.46), fs * (long ? 0.3 : 0.36), fs * (long ? 0.62 : 0.4));
                const mc = at.p.clone().add(new V(0, 0, -mr.z * (long ? 0.45 : 0.25)));
                put(j, paint(ell([mc.x, mc.y, mc.z], [mr.x, mr.y, mr.z], { ws: seg(14, 6), hs: seg(10, 5), taper: long ? (t => 0.75 + 0.25 * (t + 1) / 2) : null }), (p, nn, out) => {
                    bodyCol(p, nn, out); mixInto(out, CL.belly, 0.75);
                }), 'skin');
                const tip = new V(mc.x, mc.y + mr.y * 0.35, mc.z - mr.z * 0.95);
                put(j, place(new THREE.SphereGeometry(1, seg(10, 6), seg(7, 4)), tip, null, new V(mr.x * 0.42, mr.y * 0.3, mr.x * 0.26)), 'mouth');
                mouthAt = { p: new V(mc.x, mc.y - mr.y * 0.42, mc.z - mr.z * 0.72), w: mr.x * 0.55 };
            } else if (snout === 'beak') {
                const at = H.at(0, lowest - 22);
                const bl = fs * R.range(0.45, 0.7), br = fs * R.range(0.2, 0.28);
                const g = new THREE.ConeGeometry(br, bl, seg(10, 6), 1);
                g.rotateX(-Math.PI / 2); g.translate(0, 0, -bl / 2);
                g.scale(1, 0.75, 1);
                const beakCol = R.chance(0.6) ? U.hex(U.toHex(U.hsl(R.range(30, 48), 0.85, 0.55))) : CL.accent;
                put(j, paintSolid(place(g, at.p.clone().addScaledVector(at.n, -br * 0.4), new THREE.Quaternion().setFromUnitVectors(NEG_Z, at.n.clone().add(new V(0, -0.35, -1)).normalize())), beakCol, 0.5), 'skin');
            } else {
                const at = H.at(0, Math.max(o.mouthMin === undefined ? -30 : o.mouthMin, lowest - 30 - (n === 1 ? 6 : 0)));
                mouthAt = { p: at.p, n: at.n, w: fs * R.range(0.14, 0.22) };
            }
            if (mouthAt && !o.noMouth && (snout !== 'none' || R.chance(0.75))) {
                const arc = Math.PI * R.range(0.5, 0.75);
                const g = new THREE.TorusGeometry(1, 0.16, seg(4, 3), seg(10, 6), arc);
                g.rotateZ(Math.PI * 1.5 - arc / 2);
                const m = mouthAt.n ? new THREE.Quaternion().setFromUnitVectors(NEG_Z, mouthAt.n) : null;
                put(j, place(g, mouthAt.p, m, new V(mouthAt.w, mouthAt.w * 0.7, mouthAt.w)), 'mouth');
            }
            if (s.ears && !o.noEars) makeEars(j, H, fs);
            if (s.antennae && !o.noAntennae) makeAntennae(j, H, fs, o.antTop);
            if (s.horns && s.horns !== 'none' && !o.noHorns) makeHorns(j, H, fs);
            return H;
        }

        function makeEars(j, H, fs) {
            const kind = s.earKind || 'leaf';
            [-1, 1].forEach(function (side) {
                const at = H.at(side * (kind === 'fan' ? 80 : 50), kind === 'fan' ? 10 : 50);
                const ej = joint(j, at.p);
                let w, h, d, tilt;
                if (kind === 'round') { w = fs * 0.32; h = fs * 0.32; d = fs * 0.1; tilt = 0.3; }
                else if (kind === 'tall') { w = fs * 0.24; h = fs * 0.62; d = fs * 0.08; tilt = 0.25; }
                else if (kind === 'floppy') { w = fs * 0.24; h = fs * 0.55; d = fs * 0.08; tilt = 2.3; }
                else if (kind === 'fan') { w = fs * 0.12; h = fs * 0.42; d = fs * 0.36; tilt = 1.2; }
                else { w = fs * 0.22; h = fs * 0.48; d = fs * 0.08; tilt = 0.5; }
                const dir = new V(side * Math.sin(tilt), Math.cos(tilt), 0.1).normalize();
                const qq = new THREE.Quaternion().setFromUnitVectors(UP, dir);
                const g = ell([0, h * 0.85, 0], [w, h, d], { ws: seg(12, 6), hs: seg(8, 5), vtaper: kind === 'round' ? null : (t => 0.55 + 0.45 * Math.cos(Math.max(0, t) * 1.2)) });
                place(g, at.p, qq);
                const front = new V(0, 0, -1);
                put(ej, paint(g, function (p, n, out) {
                    bodyCol(p, n, out, { plain: true });
                    const inner = U.smooth((n.dot(front) - 0.35) / 0.3);
                    mixInto(out, CL.pink, inner * 0.8);
                    mixInto(out, CL.dark, U.smooth(((p.y - at.p.y) / (h * 1.8) - 0.75) / 0.12) * 0.7);
                }), 'skin');
                A.ears.push({ j: ej, side: side, floppy: kind === 'floppy' });
            });
        }

        function makeAntennae(j, H, fs, top) {
            const n = s.antennae;
            const AZ = [[], [0], [-22, 22], [-30, 0, 30]][n];
            const kind = s.antennaKind || 'bobble';
            AZ.forEach(function (az, i) {
                const at = top ? { p: top.clone().add(new V(az / 100 * fs, 0, 0)), n: new V(az / 60, 1, 0).normalize() } : H.at(az, 70);
                const aj = joint(j, at.p);
                const len = fs * R.range(0.6, 0.95);
                const dir = at.n.clone().add(new V(az / 50, 1.3, -0.3)).normalize();
                if (kind === 'curl') {
                    let a = at.p.clone();
                    const d = dir.clone(), axis = new V(1, 0, 0);
                    for (let k = 0; k < 4; k++) {
                        const b = a.clone().addScaledVector(d, len * 0.3);
                        limb(a, b, fs * 0.035, fs * 0.03, { radial: seg(6, 4) }).forEach(g => put(aj, paintSolid(g, CL.dark), 'skin'));
                        d.applyAxisAngle(axis, 0.65);
                        a = b;
                    }
                    const ball = place(new THREE.SphereGeometry(fs * 0.08, seg(8, 5), seg(6, 4)), a);
                    if (shine === 'glow') put(aj, ball, 'glow'); else put(aj, paintSolid(ball, CL.accent), 'skin');
                } else if (kind === 'feather') {
                    const b = at.p.clone().addScaledVector(dir, len);
                    limb(at.p, b, fs * 0.03, fs * 0.025, { radial: seg(5, 4), capB: false }).forEach(g => put(aj, paintSolid(g, CL.dark), 'skin'));
                    const g = ell([0, 0, 0], [fs * 0.16, len * 0.42, fs * 0.03], { ws: seg(10, 6), hs: seg(6, 4) });
                    place(g, at.p.clone().addScaledVector(dir, len * 0.62), new THREE.Quaternion().setFromUnitVectors(UP, dir));
                    put(aj, paint(g, function (p, nn, out) { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; mixInto(out, CL.dark, U.smooth(Math.abs(N(p.x * 40, p.y * 40, p.z * 40)) * 3 - 0.6) * 0.5); }), 'skin');
                } else {
                    const b = at.p.clone().addScaledVector(dir, len);
                    limb(at.p, b, fs * 0.04, fs * 0.03, { radial: seg(6, 4), capB: false }).forEach(g => put(aj, paintSolid(g, CL.dark), 'skin'));
                    const ball = place(new THREE.SphereGeometry(fs * 0.1, seg(9, 6), seg(7, 4)), b);
                    if (shine === 'glow') put(aj, ball, 'glow'); else put(aj, paintSolid(ball, CL.accent), 'skin');
                }
                A.ants.push({ j: aj, phase: i * 2.1 });
            });
        }

        function makeHorns(j, H, fs) {
            const kind = s.horns;
            if (kind === 'nubs') {
                [-1, 1].forEach(function (side) {
                    const at = H.at(side * 28, 62);
                    const g = new THREE.ConeGeometry(fs * 0.11, fs * 0.28, seg(8, 5), 1);
                    g.translate(0, fs * 0.12, 0);
                    put(j, paintSolid(place(g, at.p, new THREE.Quaternion().setFromUnitVectors(UP, at.n.clone().add(UP).normalize())), CL.horn, 0.2), 'skin');
                    put(j, paintSolid(place(new THREE.SphereGeometry(fs * 0.06, seg(6, 4), seg(4, 3)), at.p.clone().addScaledVector(at.n.clone().add(UP).normalize(), fs * 0.26)), CL.horn), 'skin');
                });
            } else if (kind === 'antlers') {
                [-1, 1].forEach(function (side) {
                    const at = H.at(side * 30, 64);
                    const a = at.p, b = a.clone().add(new V(side * fs * 0.35, fs * 0.6, fs * 0.05));
                    const c1 = b.clone().add(new V(side * fs * 0.22, fs * 0.28, fs * 0.08));
                    const c2 = a.clone().lerp(b, 0.55).add(new V(0, fs * 0.28, -fs * 0.12));
                    [[a, b], [b, c1], [a.clone().lerp(b, 0.55), c2]].forEach(function (pr) {
                        limb(pr[0], pr[1], fs * 0.05, fs * 0.035, { radial: seg(6, 4) }).forEach(g => put(j, paintSolid(g, CL.horn, 0.25), 'skin'));
                    });
                });
            } else if (kind === 'crest') {
                for (let k = 0; k < 3; k++) {
                    const at = H.at(0, 58 + k * 14);
                    const dir = at.n.clone().add(new V(0, 0.4, 0.9)).normalize();
                    const g = ell([0, fs * 0.22, 0], [fs * 0.06, fs * (0.28 - k * 0.04), fs * 0.13], { ws: seg(8, 5), hs: seg(6, 4) });
                    put(j, paintSolid(place(g, at.p, new THREE.Quaternion().setFromUnitVectors(UP, dir)), CL.accent, 0.3), 'skin');
                }
            } else if (kind === 'tuft') {
                for (let k = 0; k < 5; k++) {
                    const at = H.at(R.range(-20, 20), R.range(70, 88));
                    put(j, paint(ell([at.p.x, at.p.y + fs * 0.05, at.p.z], [fs * 0.13, fs * 0.16, fs * 0.13], { ws: seg(8, 5), hs: seg(6, 4), bump: 0.12 }), (p, nn, out) => { bodyCol(p, nn, out, { plain: true }); mixInto(out, CL.belly, 0.4); }), 'skin');
                }
            } else if (kind === 'lure') {
                const at = H.at(0, 72);
                const lj = joint(j, at.p);
                let a = at.p.clone();
                const pts = [new V(0, fs * 0.45, fs * 0.05), new V(0, fs * 0.25, -fs * 0.3), new V(0, -fs * 0.05, -fs * 0.35)];
                pts.forEach(function (d) { const b = a.clone().add(d); limb(a, b, fs * 0.035, fs * 0.03, { radial: seg(6, 4) }).forEach(g => put(lj, paintSolid(g, CL.dark), 'skin')); a = b; });
                put(lj, place(new THREE.SphereGeometry(fs * 0.13, seg(10, 6), seg(8, 5)), a), 'glow');
                A.ants.push({ j: lj, phase: 0.7, slow: true });
            }
        }

        // ==== legs ====
        /**
         * A leg from hip h down to the ground: two segments with a knee (or one, stubby), and a foot.
         * o: { r (thickness), knee (+1 knee forward, -1 back), out (sideways reach), foot, phase, side, kind }
         */
        function makeLeg(parent, h, o) {
            const hj = joint(parent, h);
            const ground = o.groundY === undefined ? 0 : o.groundY;
            const len = Math.max(0.05, h.y - ground);
            const r0 = o.r, out = o.out || 0;
            const fr = o.foot === undefined ? r0 * 1.25 : o.foot;
            const footY = ground + fr * 0.55;
            let kj = null;
            // People wear trousers and boots.
            const pants = person ? U.mix(CL.outfit, CL.deep, 0.2) : null, boots = person ? U.mix(CL.deep, CL.trim, 0.25) : null;
            if (o.twoSeg) {
                const knee = new V(h.x + out * 0.6, h.y - len * 0.5, h.z + (o.knee || 1) * len * 0.16);
                const ankle = new V(h.x + out, footY, h.z);
                limb(h, knee, r0, r0 * 0.82, { capA: true }).forEach(g => put(hj, person ? paintSolid(g, CL.outfit, 0.3) : paintLimb(g, h, knee, { t1: 0.5, belly: 0 }), 'skin'));
                kj = joint(hj, knee);
                limb(knee, ankle, r0 * 0.8, r0 * 0.62).forEach(g => put(kj, person ? paintSolid(g, pants, 0.3) : paintLimb(g, knee, ankle, { t0: 0.5, sock: true, belly: 0 }), 'skin'));
                const foot = ell([ankle.x, footY - fr * 0.1, ankle.z - fr * 0.35], [fr * 0.95, fr * 0.55, fr * 1.4], { ws: seg(10, 6), hs: seg(7, 4) });
                put(kj, person ? paintSolid(foot, boots, 0.3) : paint(foot, (p, n, outc) => { bodyCol(p, n, outc, { limbT: 1, belly: 0 }); mixInto(outc, sockP ? CL.belly : CL.dark, 0.6); }), 'skin');
            } else {
                const ankle = new V(h.x + out, footY, h.z);
                limb(h, ankle, r0, r0 * 0.85, { capA: true }).forEach(g => put(hj, paintLimb(g, h, ankle, { sock: true, belly: 0 }), 'skin'));
                const foot = ell([ankle.x + out * 0.15, footY - fr * 0.1, ankle.z - fr * 0.25], [fr * 1.05, fr * 0.6, fr * 1.3], { ws: seg(10, 6), hs: seg(7, 4) });
                put(hj, paint(foot, (p, n, outc) => { bodyCol(p, n, outc, { limbT: 1, belly: 0 }); mixInto(outc, sockP ? CL.belly : CL.dark, 0.55); }), 'skin');
            }
            A.legs.push({ hj: hj, kj: kj, phase: o.phase || 0, side: o.side || 0, kind: o.kind || 'walk', len: len });
            return hj;
        }

        /** An insect / crab leg: up and out from the body, then down to a little foot. */
        function makeBugLeg(parent, h, side, phase, reach, thick) {
            const hj = joint(parent, h);
            const r0 = T.r.y * (thick || 0.1);
            const knee = new V(h.x + side * reach * 0.6, h.y + T.r.y * 0.3, h.z);
            const foot = new V(h.x + side * reach, r0 * 0.8, h.z - 0.02);
            limb(h, knee, r0, r0 * 0.9, { capA: true }).forEach(g => put(hj, paintLimb(g, h, knee, { belly: 0 }), 'skin'));
            const kj = joint(hj, knee);
            limb(knee, foot, r0 * 0.9, r0 * 0.7).forEach(g => put(kj, paintLimb(g, knee, foot, { tip: 'dark', tipFrom: 0.75, belly: 0 }), 'skin'));
            A.legs.push({ hj: hj, kj: kj, phase: phase, side: side, kind: 'bug', len: h.y });
        }

        /** Tentacles from points on a ring, hanging (floaters) or splayed (crawlers). */
        function makeTentacles(parent, centre, ringR, count, len, r0, hanging) {
            const segN = seg(4, 3);
            const off = R.range(0, Math.PI * 2);
            for (let i = 0; i < count; i++) {
                const a = off + i / count * Math.PI * 2;
                const base = new V(centre.x + Math.cos(a) * ringR, centre.y, centre.z + Math.sin(a) * ringR);
                const outDir = new V(Math.cos(a), 0, Math.sin(a));
                const axis = new V(-Math.sin(a), 0, Math.cos(a));
                const joints = [];
                let p = parent, at = base.clone();
                const dir = hanging ? new V(outDir.x * 0.25, -1, outDir.z * 0.25).normalize() : new V(outDir.x * 0.35, -1, outDir.z * 0.35).normalize();
                const segL = len / segN;
                for (let k = 0; k < segN; k++) {
                    const jj = joint(p, at);
                    const d = dir.clone();
                    if (!hanging && k > 0) d.set(outDir.x, k === 1 ? -0.25 : 0.35 * (k - 1), outDir.z).normalize();
                    const nb = at.clone().addScaledVector(d, segL);
                    const rr = r0 * (1 - k / segN * 0.6);
                    limb(at, nb, rr, rr * 0.82, { radial: seg(7, 4) }).forEach(g => put(jj, paintLimb(g, at, nb, { t0: k / segN, t1: (k + 1) / segN, tip: 'accent', tipFrom: 0.8, belly: 0.25 }), 'skin'));
                    joints.push(jj); p = jj; at = nb;
                }
                if (s.glow) put(p, place(new THREE.SphereGeometry(r0 * 0.55, seg(6, 4), seg(4, 3)), at), 'glow');
                A.tents.push({ joints: joints, axis: axis, phase: i * 1.3 + R.range(0, 1), hanging: hanging });
            }
        }

        // ==== back crests, tails, wings ====
        function makeCrest(j, along, kind) {
            // along(t) -> { p, n } on the back, t 0 (front) .. 1 (back)
            if (!kind || kind === 'none') return;
            const n = kind === 'tufts' ? 4 : kind === 'leaves' ? 3 : kind === 'crystals' ? R.int(3, 5) : R.int(4, 6);
            for (let k = 0; k < n; k++) {
                const t = n === 1 ? 0.5 : 0.12 + 0.76 * k / (n - 1);
                const at = along(t);
                const sz = T.r.y * (kind === 'plates' ? 0.42 : kind === 'fin' ? 0.5 : 0.36) * (1 - Math.abs(t - 0.4) * 0.8);
                if (kind === 'plates' || kind === 'fin') {
                    const g = ell([0, sz * 0.55, 0], [sz * 0.12, sz * 0.75, sz * (kind === 'fin' ? 0.9 : 0.55)], { ws: seg(8, 5), hs: seg(6, 4) });
                    put(j, paint(place(g, at.p, new THREE.Quaternion().setFromUnitVectors(UP, at.n)), (p, nn, out) => { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; mixInto(out, CL.dark, U.smooth((at.p.y + sz * 0.5 - p.y) / (sz * 0.6)) * 0.4); }), 'skin');
                } else if (kind === 'tufts') {
                    put(j, paint(ell([at.p.x, at.p.y, at.p.z], [sz * 0.6, sz * 0.5, sz * 0.6], { ws: seg(8, 5), hs: seg(6, 4), bump: 0.15 }), (p, nn, out) => { out[0] = CL.belly[0]; out[1] = CL.belly[1]; out[2] = CL.belly[2]; }), 'skin');
                } else if (kind === 'crystals') {
                    const g = new THREE.OctahedronGeometry(sz * 0.5, 0);
                    g.scale(0.55, 1.3, 0.55);
                    const qq = new THREE.Quaternion().setFromUnitVectors(UP, at.n.clone().add(new V(R.range(-0.4, 0.4), 0.6, R.range(-0.3, 0.3))).normalize());
                    place(g, at.p, qq);
                    if (s.glow) put(j, g, 'glow'); else put(j, paintSolid(g, U.mix(CL.accent, [1, 1, 1], 0.25)), 'skin');
                } else if (kind === 'leaves') {
                    const leafC = U.hsl(R.range(85, 130), 0.55, 0.42);
                    for (let side = -1; side <= 1; side += 2) {
                        const g = ell([0, sz * 0.7, 0], [sz * 0.3, sz * 0.75, sz * 0.06], { ws: seg(8, 5), hs: seg(6, 4) });
                        const qq = new THREE.Quaternion().setFromUnitVectors(UP, at.n.clone().add(new V(side * 0.7, 0.5, 0.3)).normalize());
                        put(j, paintSolid(place(g, at.p, qq), leafC, 0.3), 'skin');
                    }
                } else {
                    put(j, paint(ell([at.p.x, at.p.y, at.p.z], [sz * 0.4, sz * 0.3, sz * 0.4], { ws: seg(8, 5), hs: seg(5, 3) }), (p, nn, out) => { bodyCol(p, nn, out); mixInto(out, CL.accent, 0.5); }), shine === 'glow' && k % 2 ? 'glow' : 'skin');
                }
            }
        }

        function makeTail(parent, base, dir, len, r0) {
            const kind = s.tailKind || 'taper';
            const segN = kind === 'whip' ? 4 : 3;
            let p = parent, at = base.clone(), d = dir.clone().normalize();
            const joints = [];
            for (let k = 0; k < segN; k++) {
                const jj = joint(p, at);
                const sl = len / segN;
                const nb = at.clone().addScaledVector(d, sl);
                const ra = r0 * (1 - k / segN * (kind === 'club' ? 0.3 : 0.7)), rb = r0 * (1 - (k + 1) / segN * (kind === 'club' ? 0.3 : 0.7));
                limb(at, nb, ra, Math.max(rb, r0 * 0.12), { radial: seg(8, 5) }).forEach(g => put(jj, paintLimb(g, at, nb, { t0: k / segN, t1: (k + 1) / segN, tip: kind === 'taper' || kind === 'whip' ? 'dark' : null, tipFrom: 0.75, belly: 0 }), 'skin'));
                joints.push(jj); p = jj; at = nb;
                if (kind === 'curl') d.applyAxisAngle(new V(1, 0, 0), -0.7);
                else d.lerp(new V(d.x, d.y * 0.3, d.z), 0.3).normalize();
            }
            if (kind === 'fluffy') put(p, paint(ell([at.x, at.y, at.z], [r0 * 2, r0 * 2, r0 * 2.3], { ws: seg(10, 6), hs: seg(8, 5), bump: 0.18 }), (pp, nn, out) => { out[0] = CL.belly[0]; out[1] = CL.belly[1]; out[2] = CL.belly[2]; mixInto(out, CL.accent, 0.25); }), 'skin');
            else if (kind === 'club') put(p, paint(ell([at.x, at.y, at.z], [r0 * 1.5, r0 * 1.3, r0 * 1.7], { ws: seg(10, 6), hs: seg(8, 5) }), (pp, nn, out) => { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; }), 'skin');
            else if (kind === 'fin' || kind === 'fan') {
                const n = kind === 'fan' ? 5 : 2;
                for (let k = 0; k < n; k++) {
                    const a = (k - (n - 1) / 2) * (kind === 'fan' ? 0.32 : 0.9);
                    const fd = d.clone().applyAxisAngle(UP, a).add(new V(0, kind === 'fan' ? 0.15 : 0, 0)).normalize();
                    const g = ell([0, 0, 0], [r0 * (kind === 'fan' ? 0.5 : 0.25), r0 * 0.15, r0 * (kind === 'fan' ? 2.4 : 2)], { ws: seg(8, 5), hs: seg(5, 3) });
                    place(g, at.clone().addScaledVector(fd, r0 * 1.6), new THREE.Quaternion().setFromUnitVectors(new V(0, 0, 1), fd));
                    put(p, paint(g, (pp, nn, out) => { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; mixInto(out, CL.dark, 0.25); }), 'skin');
                }
            }
            if (s.glow && kind !== 'fluffy' && kind !== 'club') put(p, place(new THREE.SphereGeometry(r0 * 0.6, seg(6, 4), seg(4, 3)), at), 'glow');
            A.tail = joints;
        }

        /** A wing at shoulder sh on side +1/-1: feathers, a moth's pair, or a membrane. */
        function makeWing(parent, sh, side, span, kind) {
            const wj = joint(parent, sh);
            if (kind === 'bug') {
                [[0.95, -0.25, 1], [0.72, 0.5, 0.75]].forEach(function (w, k) {
                    const g = new THREE.CircleGeometry(1, seg(16, 8));
                    g.rotateX(-Math.PI / 2);
                    g.scale(span * w[0] * 0.55, 1, span * w[2] * 0.42);
                    g.translate(side * span * w[0] * 0.52, 0, w[1] * span * 0.4);
                    place(g, sh);
                    const eyeC = new V(sh.x + side * span * w[0] * 0.62, sh.y, sh.z + w[1] * span * 0.4);
                    put(wj, paint(g, function (p, n, out) {
                        out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2];
                        const edge = Math.abs(p.x - sh.x) / (span * w[0] * 1.05);
                        mixInto(out, CL.main, U.smooth((0.35 - edge) / 0.25) * 0.7);
                        mixInto(out, CL.dark, U.smooth((edge - 0.82) / 0.1) * 0.8);
                        const d = p.distanceTo(eyeC) / (span * 0.16);
                        if (k === 0 && d < 1) { mixInto(out, d < 0.45 ? CL.dark : CL.belly, 0.9); }
                    }), 'film');
                });
            } else if (kind === 'membrane') {
                const g = new THREE.CircleGeometry(1, seg(12, 6), -Math.PI * 0.05, Math.PI * 0.75);
                g.rotateX(-Math.PI / 2);
                g.scale(side * span, 1, span * 0.7);
                place(g, sh);
                put(wj, paint(g, (p, n, out) => { out[0] = CL.dark[0]; out[1] = CL.dark[1]; out[2] = CL.dark[2]; mixInto(out, CL.accent, U.smooth((Math.abs(p.x - sh.x) / span - 0.6) / 0.3) * 0.5); }), 'sheet');
                limb(sh, sh.clone().add(new V(side * span, span * 0.05, -span * 0.05)), span * 0.03, span * 0.02, { radial: seg(5, 4) }).forEach(gg => put(wj, paintSolid(gg, CL.dark), 'skin'));
            } else {
                const n = span > 0.5 ? 5 : 4;
                for (let k = 0; k < n; k++) {
                    const t = k / (n - 1);
                    const len = span * (0.55 + 0.45 * Math.sin(Math.PI * (0.25 + 0.6 * t)));
                    const dir = new V(side * (1 - t * 0.35), 0, 0.15 + t * 0.85).normalize();
                    const g = ell([0, 0, 0], [span * 0.13, span * 0.035, len * 0.5], { ws: seg(8, 5), hs: seg(5, 3) });
                    place(g, sh.clone().addScaledVector(dir, len * 0.45).add(new V(0, -k * span * 0.01, 0)), new THREE.Quaternion().setFromUnitVectors(new V(0, 0, 1), dir));
                    put(wj, paint(g, (p, nn, out) => {
                        out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2];
                        mixInto(out, CL.accent, U.smooth((p.distanceTo(sh) / span - 0.55) / 0.3) * 0.85);
                        mixInto(out, CL.belly, U.smooth((-nn.y - 0.2) / 0.5) * 0.5);
                    }), 'skin');
                }
            }
            A.wings.push({ j: wj, side: side, kind: kind });
        }

        // ==== body plans ====
        let face = null, faceJ = pivot, trunkJ = pivot;
        const RR = (a, b) => R.range(a, b);

        if (B === 'quad') {
            const prop = { grazer: [0.5, 0.27, 0.5, 0.42, 0.27], stocky: [0.5, 0.36, 0.28, 0.12, 0.3], lithe: [0.56, 0.24, 0.46, 0.2, 0.26], pup: [0.42, 0.3, 0.3, 0.1, 0.36], crawler: [0.62, 0.24, 0.14, 0.08, 0.27] }[VAR] || [0.5, 0.3, 0.35, 0.2, 0.3];
            const L = prop[0] * RR(0.9, 1.12), gy = prop[1] * RR(0.9, 1.1), legLen = prop[2] * RR(0.85, 1.15), neck = prop[3] * RR(0.8, 1.2), hr = prop[4] * RR(0.9, 1.12);
            const gx = gy * RR(0.95, 1.15);
            const ty = legLen + gy * 0.9;
            T.c.set(0, ty, 0); T.r.set(gx, gy, L);
            put(pivot, paintBody(ell([0, ty, 0], [gx, gy, L], { ws: seg(22, 8), hs: seg(15, 6), taper: t => 1 + 0.1 * -t - 0.06 * t * t, bump: s.crest === 'tufts' ? 0.05 : 0 })), 'skin');
            const legR = gy * (VAR === 'stocky' ? 0.33 : VAR === 'crawler' ? 0.22 : 0.24);
            const pairs = s.legs / 2;
            for (let i = 0; i < pairs; i++) {
                const z = pairs === 1 ? 0 : (-0.62 + 1.24 * i / (pairs - 1)) * L;
                [-1, 1].forEach(function (side) {
                    const hy = ty - gy * Math.sqrt(Math.max(0.15, 1 - (z / L) ** 2)) * 0.62;
                    const phase = (i % 2) * Math.PI + (side > 0 ? Math.PI : 0) + (pairs > 2 ? i * 0.6 : 0);
                    makeLeg(pivot, new V(side * gx * 0.58, hy, z), { r: legR, twoSeg: legLen > 0.2 && s.legKind === 'stick', knee: i === 0 ? 1 : -1, out: side * (VAR === 'crawler' ? gx * 0.18 : gx * 0.08), phase: phase, side: side });
                });
            }
            // Neck and head: the neck joint lets it nod and graze.
            const nb = new V(0, ty + gy * 0.45, -L * 0.82);
            const hc = new V(0, nb.y + neck * 0.9 + hr * 0.3, nb.z - neck * 0.45 - hr * 0.55);
            const nj = joint(pivot, nb);
            if (neck > 0.12) limb(nb, hc, gy * 0.48, hr * 0.62, { capB: false, radial: seg(10, 6) }).forEach(g => put(nj, paintLimb(g, nb, hc, { belly: undefined }), 'skin'));
            else limb(nb, hc, gy * 0.6, hr * 0.7, { capB: false, radial: seg(10, 6) }).forEach(g => put(nj, paintBody(g), 'skin'));
            face = makeHead(nj, hc, new V(hr, hr * 0.94, hr * 1.02), { spread: RR(28, 42), el: RR(8, 18) });
            faceJ = nj; A.neck = { j: nj, graze: VAR === 'grazer' || VAR === 'stocky' || neck > 0.3 };
            if (s.tail) makeTail(pivot, new V(0, ty + gy * 0.3, L * 0.92), new V(0, 0.5, 1), L * RR(0.5, 0.9), gy * 0.22);
            makeCrest(pivot, t => { const z = (-0.6 + 1.1 * t) * L; return { p: new V(0, ty + gy * Math.sqrt(Math.max(0.05, 1 - (z / L) ** 2)) * 0.98, z), n: new V(0, 1, z / L * 0.3).normalize() }; }, s.crest);
        } else if (B === 'biped' || B === 'person') {
            const isP = B === 'person';
            const hop = VAR === 'hopper', dino = VAR === 'dino';
            const tw = isP ? RR(0.24, 0.3) : RR(0.28, 0.36), th = isP ? RR(0.3, 0.36) : RR(0.36, 0.46), td = tw * RR(0.85, 1);
            const legLen = isP ? RR(0.3, 0.42) : s.legKind === 'stick' ? RR(0.36, 0.5) : RR(0.16, 0.24);
            const lean = isP ? 0 : dino ? RR(0.3, 0.5) : hop ? RR(0.15, 0.3) : RR(0, 0.12);
            const ty = legLen + th * 0.85;
            T.c.set(0, ty, 0); T.r.set(tw, th, td); T.upright = true;
            const qLean = new THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), -lean);
            const torso = ell([0, 0, 0], [tw, th, td], { ws: seg(20, 8), hs: seg(15, 6), vtaper: t => (isP ? 1 - 0.1 * t : 1 - 0.18 * t), quat: qLean });
            torso.translate(0, ty, 0);
            if (isP) put(pivot, paint(torso, (p, n, out) => personCol(p, n, out, ty, th)), 'skin');
            else put(pivot, paintBody(torso), 'skin');
            const top = new V(0, ty + th * 0.92, -Math.sin(lean) * th * 0.9);
            const hr = isP ? RR(0.3, 0.36) : RR(0.24, 0.32);
            const hc = top.clone().add(new V(0, hr * 0.8, -hr * 0.12 - Math.sin(lean) * hr * 0.5));
            const hj = joint(pivot, top);
            limb(top, hc, tw * 0.42, hr * 0.5, { capB: false, radial: seg(10, 6) }).forEach(g => put(hj, isP ? paint(g, (p, n, out) => personCol(p, n, out, ty, th)) : paintBody(g), 'skin'));
            const hs = isP ? personHeadShape(hr) : new V(hr, hr * 0.96, hr);
            if (isP) {
                face = makePersonHead(hj, hc, hs);
            } else {
                face = makeHead(hj, hc, hs, { spread: RR(26, 38), el: RR(10, 20), snout: s.snout });
            }
            faceJ = hj; A.head = { j: hj };
            // Legs.
            [-1, 1].forEach(function (side) {
                makeLeg(pivot, new V(side * tw * 0.55, ty - th * 0.62, Math.sin(lean) * th * 0.3), {
                    r: tw * (isP ? 0.3 : hop ? 0.36 : 0.3), twoSeg: legLen > 0.28, knee: isP ? 1 : -1, foot: tw * (isP ? 0.34 : hop ? 0.55 : 0.36),
                    out: side * tw * 0.12, phase: side > 0 ? Math.PI : 0, side: side
                });
            });
            // Arms (people may have four).
            const armN = isP ? look.arms : 2;
            for (let a = 0; a < armN; a++) {
                const ay = ty + th * (0.42 - a * 0.32);
                [-1, 1].forEach(function (side) {
                    const sh = new V(side * tw * 0.92, ay, -Math.sin(lean) * (ay - ty) - td * 0.1);
                    const aj = joint(pivot, sh);
                    const al = isP ? th * RR(1.0, 1.15) * (a ? 0.8 : 1) : th * RR(0.45, 0.65);
                    const elbow = sh.clone().add(new V(side * al * 0.18, -al * 0.5, -al * (isP ? 0.05 : 0.22)));
                    const hand = elbow.clone().add(new V(side * al * 0.04, -al * (isP ? 0.45 : 0.28), -al * (isP ? 0.12 : 0.3)));
                    const ar = tw * (isP ? 0.2 : 0.16);
                    limb(sh, elbow, ar, ar * 0.85, { capA: true }).forEach(g => put(aj, isP ? paint(g, (p, n, out) => personSleeve(p, n, out, sh, elbow)) : paintLimb(g, sh, elbow, { belly: 0 }), 'skin'));
                    const ej = joint(aj, elbow);
                    limb(elbow, hand, ar * 0.85, ar * 0.7).forEach(g => put(ej, isP ? paintSolid(g, CL.main) : paintLimb(g, elbow, hand, { belly: 0, t0: 0.5 }), 'skin'));
                    put(ej, paint(ell([hand.x, hand.y - ar * 0.4, hand.z], [ar * 1.15, ar * 1.25, ar * 1.0], { ws: seg(8, 5), hs: seg(6, 4) }), (p, n, out) => { bodyCol(p, n, out, { plain: true, belly: 0 }); if (isP) { out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2]; } }), 'skin');
                    A.arms.push({ j: aj, ej: ej, side: side, wave: isP && a === 0 && side > 0, phase: side > 0 ? 0 : Math.PI });
                });
            }
            if (!isP && s.tail) makeTail(pivot, new V(0, ty - th * 0.55, td * 0.7), new V(0, hop ? -0.35 : 0.05, 1), (hop ? 0.8 : dino ? 0.75 : 0.4) * th * 1.6, tw * (hop || dino ? 0.42 : 0.2));
            if (!isP) makeCrest(pivot, t => { const y = ty + th * (0.8 - t * 1.1); const z = td * 0.95 + Math.sin(lean) * (y - ty); return { p: new V(0, y, z * 0.95), n: new V(0, 0.3, 1).normalize() }; }, s.crest === 'plates' || s.crest === 'fin' || s.crest === 'tufts' || s.crest === 'crystals' ? s.crest : 'none');
            if (isP) personGear(hj, hc, hs);
        } else if (B === 'puff') {
            const balloon = VAR === 'balloon';
            const legsN = s.legs > 0 && s.legKind !== 'tentacle' ? s.legs : 0;
            const r0 = balloon ? RR(0.5, 0.58) : RR(0.42, 0.5);
            const r = new V(r0 * RR(0.95, 1.08), r0 * RR(0.86, 1), r0 * RR(0.92, 1.04));
            const lift = legsN ? RR(0.12, 0.2) : (s.legKind === 'tentacle' && s.legs ? RR(0.4, 0.55) : 0);
            const c = new V(0, lift + r.y, 0);
            T.c.copy(c); T.r.copy(r);
            const bj = joint(pivot, c);
            trunkJ = bj;
            put(bj, paintBody(ell([c.x, c.y, c.z], [r.x, r.y, r.z], {
                ws: seg(24, 8), hs: seg(17, 6), bump: VAR === 'fluff' ? 0.06 : 0, bumpF: 7,
                vtaper: VAR === 'pear' ? (t => 1.05 - 0.2 * Math.max(0, t)) : null
            })), 'skin');
            face = makeHead(bj, c, r, { faceOnly: true, spread: RR(18, 25), el: RR(6, 14), eyeR: s.eyes === 1 ? 0.32 : s.eyes === 2 ? 0.26 : 0.21, snout: s.snout === 'muzzle' || s.snout === 'long' ? 'none' : s.snout, mouthMin: -28 });
            faceJ = bj; A.bob.push(bj);
            if (legsN) [-1, 1].forEach(side => makeLeg(pivot, new V(side * r.x * 0.42, lift + r.y * 0.35, 0.02), { r: r.x * 0.12, foot: r.x * 0.2, twoSeg: false, out: side * r.x * 0.05, phase: side > 0 ? Math.PI : 0, side: side }));
            if (s.legKind === 'tentacle' && s.legs > 0) makeTentacles(bj, new V(0, c.y - r.y * 0.75, 0), r.x * 0.45, s.legs, lift * 1.4 + r.y * 0.3, r.x * 0.09, floaty);
            if (s.wings) [-1, 1].forEach(side => makeWing(bj, new V(side * r.x * 0.85, c.y + r.y * 0.15, r.z * 0.1), side, r.x * (floaty ? 1.0 : 0.7), 'feather'));
            if (balloon) [-1, 1].forEach(function (side) {
                const fj = joint(bj, new V(side * r.x * 0.95, c.y - r.y * 0.1, 0));
                const g = ell([0, 0, 0], [r.x * 0.32, r.x * 0.05, r.x * 0.22], { ws: seg(10, 6), hs: seg(6, 4) });
                place(g, new V(side * r.x * 1.18, c.y - r.y * 0.1, 0));
                put(fj, paint(g, (p, n, out) => { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; }), 'skin');
                A.fins.push({ j: fj, side: side });
            });
            if (s.tail) makeTail(bj, new V(0, c.y - r.y * 0.2, r.z * 0.92), new V(0, 0.3, 1), r.x * 0.6, r.x * 0.1);
            makeCrest(bj, t => { const a = (0.2 + t * 0.6) * Math.PI; return { p: new V(0, c.y + Math.sin(a) * r.y, c.z - Math.cos(a) * r.z * 0.9), n: new V(0, Math.sin(a), -Math.cos(a)) }; }, s.crest === 'leaves' || s.crest === 'crystals' || s.crest === 'tufts' ? s.crest : 'none');
        } else if (B === 'flat') {
            if (VAR === 'ray') {
                const r = new V(RR(0.22, 0.28), RR(0.12, 0.15), RR(0.42, 0.52));
                const c = new V(0, 0.2, 0);
                T.c.copy(c); T.r.copy(r);
                put(pivot, paintBody(ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(18, 8), hs: seg(10, 5), taper: t => 1 + 0.1 * -t })), 'skin');
                const span = RR(0.55, 0.75);
                [-1, 1].forEach(function (side) {
                    const fj = joint(pivot, new V(side * r.x * 0.7, c.y, 0));
                    const g = new THREE.SphereGeometry(1, seg(16, 8), seg(8, 4));
                    const pg = g.attributes.position;
                    for (let i = 0; i < pg.count; i++) {
                        let x = pg.getX(i), y = pg.getY(i), z = pg.getZ(i);
                        const u = (x + 1) / 2;                      // 0 at the body .. 1 at the tip
                        z = z * r.z * (1 - u * 0.65) + u * u * span * 0.35;
                        y = y * r.y * 0.45 * (1 - u * 0.7) - u * u * span * 0.08;
                        x = u * span;
                        pg.setXYZ(i, side * x, y, z);
                    }
                    smoothSeams(g);
                    g.translate(side * r.x * 0.55, c.y, -r.z * 0.05);
                    put(fj, paint(g, (p, n, out) => { bodyCol(p, n, out); mixInto(out, CL.accent, U.smooth((Math.abs(p.x) / (span + r.x) - 0.55) / 0.3) * 0.85); }), 'skin');
                    A.fins.push({ j: fj, side: side, ray: true });
                });
                face = makeHead(pivot, c, r, { faceOnly: true, spread: 40, el: 16, eyeR: 0.85, snout: 'none', mouthMin: -20 });
                if (s.tail) makeTail(pivot, new V(0, c.y, r.z * 0.9), new V(0, 0, 1), r.z * 2.2, r.x * 0.12);
            } else if (VAR === 'frog') {
                const r = new V(RR(0.36, 0.44), RR(0.22, 0.28), RR(0.36, 0.44));
                const c = new V(0, r.y * 0.95 + 0.05, 0);
                T.c.copy(c); T.r.copy(r);
                put(pivot, paintBody(ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(20, 8), hs: seg(14, 6), quat: new THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), 0.25), taper: t => 1 + 0.08 * -t })), 'skin');
                face = makeHead(pivot, c.clone().add(new V(0, r.y * 0.15, -r.z * 0.1)), r, { faceOnly: true, spread: RR(30, 38), el: RR(32, 44), eyeR: 0.3, snout: 'none', mouthMin: -10 });
                [-1, 1].forEach(function (side) {
                    makeLeg(pivot, new V(side * r.x * 0.75, c.y - r.y * 0.2, r.z * 0.45), { r: r.y * 0.3, foot: r.y * 0.45, twoSeg: true, knee: 1, out: side * r.x * 0.35, phase: 0, side: side, kind: 'frog' });
                    const fa = new V(side * r.x * 0.55, c.y - r.y * 0.5, -r.z * 0.55), fb = new V(side * r.x * 0.65, r.y * 0.12, -r.z * 0.75);
                    limb(fa, fb, r.y * 0.16, r.y * 0.12).forEach(g => put(pivot, paintLimb(g, fa, fb, { belly: 0.3 }), 'skin'));
                    put(pivot, paint(ell([fb.x, r.y * 0.08, fb.z - r.y * 0.1], [r.y * 0.22, r.y * 0.1, r.y * 0.26], { ws: seg(8, 5), hs: seg(5, 3) }), (p, n, out) => { bodyCol(p, n, out, { belly: 0.5 }); }), 'skin');
                });
            } else {
                // slug, crab, octo
                const slug = VAR === 'slug', octo = VAR === 'octo';
                const r = slug ? new V(RR(0.26, 0.32), RR(0.16, 0.2), RR(0.58, 0.7)) : octo ? new V(RR(0.36, 0.42), RR(0.32, 0.4), RR(0.36, 0.42)) : new V(RR(0.46, 0.55), RR(0.2, 0.26), RR(0.34, 0.4));
                const lift = slug ? 0 : octo ? RR(0.22, 0.3) : RR(0.18, 0.26);
                const c = new V(0, lift + r.y * (slug ? 0.85 : 0.9), 0);
                T.c.copy(c); T.r.copy(r);
                put(pivot, paintBody(ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(22, 8), hs: seg(14, 6), cap: slug ? Math.PI * 0.62 : Math.PI, taper: slug ? (t => 1 + 0.12 * -t - 0.25 * Math.max(0, t) * Math.max(0, t)) : null, vtaper: octo ? (t => 1 - 0.12 * Math.max(0, -t)) : null })), 'skin');
                if (slug) {
                    put(pivot, paintBody(ell([c.x, c.y - r.y * 0.62, c.z], [r.x * 1.18, r.y * 0.34, r.z * 1.05], { ws: seg(20, 8), hs: seg(8, 4) }), { belly: 0.7 }), 'skin');
                    const hc = new V(0, c.y + r.y * 0.25, -r.z * 0.78);
                    face = makeHead(pivot, hc, new V(r.x * 0.82, r.y * 1.25, r.x * 0.8), { stalks: s.eyeStalks, spread: 30, el: 12, snout: 'none', mouthMin: -30 });
                } else {
                    face = makeHead(pivot, c, r, { faceOnly: true, stalks: s.eyeStalks, spread: octo ? 26 : 22, el: octo ? 14 : 28, eyeR: octo ? 0.26 : 0.4, snout: 'none', mouthMin: octo ? -12 : 0 });
                    if (octo) makeTentacles(pivot, new V(0, c.y - r.y * 0.6, 0), r.x * 0.5, s.legs, lift * 1.5 + r.y * 0.5, r.x * 0.17, false);
                    else {
                        const pairs = s.legs / 2;
                        for (let i = 0; i < pairs; i++) {
                            const z = (-0.55 + 1.1 * i / (pairs - 1)) * r.z;
                            [-1, 1].forEach(side => makeBugLeg(pivot, new V(side * r.x * 0.7 * Math.sqrt(1 - (z / r.z) ** 2 * 0.6), c.y - r.y * 0.4, z * 0.8 + r.z * 0.1), side, i * 1.1 + (side > 0 ? Math.PI : 0), r.x * 0.48, 0.3));
                        }
                        [-1, 1].forEach(function (side) {
                            const sh = new V(side * r.x * 0.62, c.y - r.y * 0.25, -r.z * 0.7);
                            const mj = joint(pivot, sh);
                            const elbow = sh.clone().add(new V(side * r.x * 0.28, -r.y * 0.1, -r.z * 0.3));
                            limb(sh, elbow, r.y * 0.16, r.y * 0.14).forEach(g => put(mj, paintLimb(g, sh, elbow, { belly: 0 }), 'skin'));
                            const mc = elbow.clone().add(new V(side * r.x * 0.08, r.y * 0.15, -r.z * 0.32));
                            put(mj, paint(ell([mc.x, mc.y, mc.z], [r.x * 0.22, r.y * 0.48, r.z * 0.4], { ws: seg(12, 6), hs: seg(9, 5) }), (pp, nn, out) => { bodyCol(pp, nn, out, { belly: 0 }); mixInto(out, CL.accent, 0.45); }), 'skin');
                            A.arms.push({ j: mj, ej: mj, side: side, mitt: true, phase: side > 0 ? 0 : Math.PI });
                        });
                    }
                }
            }
            faceJ = pivot;
        } else if (B === 'worm') {
            const n = R.int(6, 9), r0 = RR(0.2, 0.26);
            const lift = s.legs ? r0 * 0.35 : 0;
            let z = 0, prev = r0;
            T.c.set(0, lift + r0, 0.6); T.r.set(r0, r0, 0.8);
            const segsInfo = [];
            for (let i = 0; i < n; i++) {
                const ri = i === 0 ? r0 * 1.15 : r0 * Math.pow(0.95, i - 1) * (i === n - 1 ? 0.7 : 1);
                if (i > 0) z += (prev + ri) * 0.62;
                segsInfo.push({ z: z, r: ri });
                prev = ri;
            }
            T.c.set(0, lift + r0, z / 2); T.r.set(r0, r0, z / 2 + r0);
            const stripeAlt = pat === 'stripes' || pat === 'rings';
            segsInfo.forEach(function (si, i) {
                const g = joint(pivot, new V(0, lift + si.r, si.z));
                put(g, paint(ell([0, lift + si.r, si.z], [si.r, si.r * 0.95, si.r * (i === 0 ? 1 : 0.92)], { ws: i === 0 ? seg(18, 8) : seg(12, 6), hs: i === 0 ? seg(13, 6) : seg(9, 5) }), function (p, nn, out) {
                    bodyCol(p, nn, out);
                    if (stripeAlt && i > 0 && i % 2) mixInto(out, CL[stripeCol], 0.75 * (1 - U.smooth((-nn.y - 0.2) / 0.5)));
                }), 'skin');
                A.segs.push({ j: g, y: lift + si.r, r: si.r });
                if (s.legs && i > 0 && i <= s.legs / 2) {
                    [-1, 1].forEach(function (side) {
                        const a = new V(side * si.r * 0.5, lift + si.r * 0.35, si.z), b = new V(side * si.r * 0.62, si.r * 0.12, si.z);
                        limb(a, b, si.r * 0.18, si.r * 0.14).forEach(gg => put(g, paintLimb(gg, a, b, { tip: 'dark', tipFrom: 0.6, belly: 0.6 }), 'skin'));
                    });
                }
                if (i > 0 && i < n - 1 && s.crest === 'crystals') makeCrest(g, () => ({ p: new V(0, lift + si.r * 1.85, si.z), n: UP.clone() }), i % 2 ? 'crystals' : 'none');
                else if (i > 0 && i < n - 1 && (s.crest === 'bumps' || s.crest === 'tufts') && i % 2) put(g, paint(ell([0, lift + si.r * 1.85, si.z], [si.r * 0.32, si.r * 0.3, si.r * 0.32], { ws: seg(8, 5), hs: seg(6, 4), bump: s.crest === 'tufts' ? 0.15 : 0 }), (p, nn, out) => { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; }), s.glow ? 'glow' : 'skin');
            });
            faceJ = A.segs[0].j;
            const h0 = segsInfo[0];
            face = makeHead(faceJ, new V(0, lift + h0.r, h0.z), new V(h0.r, h0.r * 0.95, h0.r), { faceOnly: true, stalks: s.eyeStalks, spread: 28, el: 14, eyeR: 0.26, snout: 'none', mouthMin: -30 });
        } else if (B === 'jelly') {
            const balloon = VAR === 'balloon', siphon = VAR === 'siphon';
            const r = new V(RR(0.44, 0.54), balloon ? RR(0.5, 0.6) : RR(0.36, 0.48), RR(0.44, 0.54));
            const lift = s.legs ? RR(0.62, 0.8) : 0.08;
            const c = new V(0, lift, 0);
            T.c.copy(c).add(new V(0, r.y * 0.5, 0)); T.r.copy(r);
            const bj = joint(pivot, c);
            trunkJ = bj;
            if (balloon) {
                put(bj, paintBody(ell([c.x, c.y + r.y * 0.7, c.z], [r.x, r.y, r.z], { ws: seg(22, 8), hs: seg(15, 6), vtaper: t => 1 - 0.25 * Math.max(0, -t) })), 'skin');
                face = makeHead(bj, new V(0, c.y + r.y * 0.7, 0), r, { faceOnly: true, spread: 26, el: -6, eyeR: 0.2, snout: 'none', mouthMin: -36 });
            } else {
                // The bell: see-through, with a soft opaque core inside and a frilly rim.
                const bell = ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(22, 8), hs: seg(10, 5), cap: Math.PI / 2, vtaper: siphon ? (t => 1 - 0.3 * t) : null });
                put(bj, paint(bell, (p, n, out) => { bodyCol(p, n, out, { belly: 0 }); mixInto(out, CL.belly, U.smooth((0.3 - (p.y - c.y) / r.y) / 0.3) * 0.5); }), 'film');
                put(bj, paint(ell([c.x, c.y + r.y * 0.3, c.z], [r.x * 0.55, r.y * 0.5, r.z * 0.55], { ws: seg(12, 6), hs: seg(8, 5) }), (p, n, out) => { out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2]; mixInto(out, CL.belly, 0.3); }), s.glow ? 'glow' : 'skin');
                const rim = new THREE.TorusGeometry(1, 0.07, seg(5, 3), seg(28, 10));
                rim.rotateX(Math.PI / 2);
                const rp = rim.attributes.position;
                for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), zz = rp.getZ(i), a = Math.atan2(zz, x); rp.setY(i, rp.getY(i) + Math.sin(a * 10) * 0.05); }
                rim.computeVertexNormals();
                place(rim, c, null, new V(r.x, r.y, r.z));
                put(bj, paintSolid(rim, CL.accent), s.glow ? 'glow' : 'skin');
                face = makeHead(bj, c, r, { faceOnly: true, spread: 30, el: 26, eyeR: 0.2, snout: 'none', mouthMin: 10 });
                // Frilly oral arms in the middle.
                if (!siphon) for (let k = 0; k < 3; k++) {
                    const a = k / 3 * Math.PI * 2 + 0.4;
                    const top = new V(Math.cos(a) * r.x * 0.15, c.y - 0.02, Math.sin(a) * r.z * 0.15);
                    const g = ell([0, 0, 0], [r.x * 0.12, lift * 0.42, r.x * 0.04], { ws: seg(8, 5), hs: seg(8, 5), bump: 0.25, bumpF: 9 });
                    place(g, top.clone().add(new V(0, -lift * 0.4, 0)), new THREE.Quaternion().setFromAxisAngle(UP, a));
                    put(bj, paint(g, (p, n, out) => { out[0] = CL.belly[0]; out[1] = CL.belly[1]; out[2] = CL.belly[2]; mixInto(out, CL.accent, 0.35); }), 'film');
                }
            }
            if (s.legs > 0) makeTentacles(bj, new V(0, balloon ? c.y + 0.02 : c.y - 0.01, 0), r.x * (balloon ? 0.35 : 0.78), s.legs, lift * (balloon ? 0.95 : 1.0), r.x * 0.05, true);
            faceJ = bj; A.bob.push(bj); A.jelly = bj;
        } else if (B === 'shell') {
            if (VAR === 'snail') {
                const r = new V(RR(0.22, 0.27), RR(0.13, 0.16), RR(0.56, 0.66));
                const c = new V(0, r.y * 0.7, 0);
                T.c.copy(c); T.r.copy(r);
                put(pivot, paintBody(ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(18, 8), hs: seg(10, 5), cap: Math.PI * 0.6, taper: t => 1 + 0.08 * -t - 0.4 * Math.max(0, t) ** 2 })), 'skin');
                put(pivot, paintBody(ell([c.x, c.y - r.y * 0.5, c.z], [r.x * 1.15, r.y * 0.3, r.z], { ws: seg(16, 8), hs: seg(6, 4) }), { belly: 0.7 }), 'skin');
                // A coiled shell: a tube along a spiral that narrows toward the middle, with growth bands.
                const R0 = r.x * 1.25, turns = 2.3, kk = Math.log(5) / (turns * Math.PI * 2);
                const sc = new V(0, c.y + r.y * 0.6 + R0 * 1.05, r.z * 0.1);
                const K = seg(44, 18), Mr = seg(10, 6), a0 = -Math.PI * 0.8;
                const tAt = [];
                const ptAt = function (t) {
                    const a = t * turns * Math.PI * 2, rad = R0 * Math.exp(-kk * a);
                    return { p: new V(rad * 0.35 * (1 - t), sc.y + Math.sin(a0 - a) * rad, sc.z + Math.cos(a0 - a) * rad), tube: rad * 0.31 * 1.12, a: a };
                };
                const pos = [], idx = [];
                for (let k = 0; k <= K; k++) {
                    const t = k / K, A0 = ptAt(t), A1 = ptAt(Math.min(1, t + 1e-3)), A2 = ptAt(Math.max(0, t - 1e-3));
                    const tan = new V().subVectors(A1.p, A2.p).normalize();
                    const b1 = new V(1, 0, 0), b2 = new V().crossVectors(tan, b1).normalize();
                    b1.crossVectors(b2, tan).normalize();
                    const tr = A0.tube * (k === K ? 0.2 : 1);
                    for (let m = 0; m < Mr; m++) {
                        const th = m / Mr * Math.PI * 2;
                        pos.push(A0.p.x + (b1.x * Math.cos(th) * 0.85 + b2.x * Math.sin(th)) * tr, A0.p.y + (b1.y * Math.cos(th) * 0.85 + b2.y * Math.sin(th)) * tr, A0.p.z + (b1.z * Math.cos(th) * 0.85 + b2.z * Math.sin(th)) * tr);
                        tAt.push(A0.a);
                    }
                    if (k > 0) for (let m = 0; m < Mr; m++) { const a = (k - 1) * Mr + m, b = (k - 1) * Mr + (m + 1) % Mr, cc = k * Mr + m, d = k * Mr + (m + 1) % Mr; idx.push(a, cc, b, b, cc, d); }
                }
                const shell = new THREE.BufferGeometry();
                shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                shell.setIndex(idx);
                shell.computeVertexNormals();
                let vi = 0;
                put(pivot, paint(shell, (pp, nn, out) => {
                    const a = tAt[vi++];
                    out[0] = CL.accent[0]; out[1] = CL.accent[1]; out[2] = CL.accent[2];
                    const f = (a * 1.4) % 1;
                    mixInto(out, CL.dark, U.smooth((0.22 - Math.min(f, 1 - f)) / 0.12) * 0.55);
                    mixInto(out, CL.belly, U.smooth((nn.y - 0.3) / 0.5) * 0.3);
                }), 'skin');
                face = makeHead(pivot, new V(0, c.y + r.y * 0.3, -r.z * 0.78), new V(r.x * 0.85, r.y * 1.5, r.x * 0.85), { stalks: true, spread: 30, el: 10, snout: 'none', mouthMin: -25 });
            } else if (VAR === 'pillbug') {
                const rr = RR(0.42, 0.48);
                const c = new V(0, rr, 0);
                T.c.copy(c); T.r.set(rr, rr, rr);
                const sj = joint(pivot, c);
                trunkJ = sj;
                const nBands = R.int(6, 8);
                const ball = ell([0, 0, 0], [rr, rr, rr * 1.02], { ws: seg(26, 10), hs: seg(16, 6) });
                const bp = ball.attributes.position;
                for (let i = 0; i < bp.count; i++) {
                    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
                    const a = (Math.atan2(y, z) / Math.PI + 1) * nBands, f = a - Math.floor(a);
                    const k = 1 + 0.05 * Math.sin(Math.PI * f) * U.smooth((rr - Math.abs(x)) / (rr * 0.3));
                    bp.setXYZ(i, x, y * k, z * k);
                }
                smoothSeams(ball);
                ball.translate(c.x, c.y, c.z);
                put(sj, paint(ball, (p, nn, out) => {
                    out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2];
                    const a = (Math.atan2(p.y - c.y, p.z - c.z) / Math.PI + 1) * nBands;
                    const f = a - Math.floor(a), band = Math.floor(a);
                    if (band % 2) mixInto(out, pat === 'plain' ? CL.dark : CL.accent, 0.55);
                    mixInto(out, [1, 1, 1], U.smooth((f - 0.55) / 0.3) * 0.18);
                    mixInto(out, CL.deep, U.smooth((0.14 - Math.min(f, 1 - f)) / 0.07) * 0.9);
                    mixInto(out, CL.belly, U.smooth((Math.abs(p.x - c.x) / rr - 0.85) / 0.1) * 0.7);
                }), 'skin');
                A.spin = sj;
                // The face peeks out at the front and stays upright while the shell rolls.
                const hc = new V(0, rr * 0.52, -rr * 0.86), hr = new V(rr * 0.5, rr * 0.42, rr * 0.4);
                const hj = joint(pivot, hc);
                face = makeHead(hj, hc, hr, { spread: 30, el: 14, eyeR: 0.3, snout: 'none', mouthMin: -30 });
                faceJ = hj; A.head = { j: hj };
            } else {
                // tortoise or beetle: a domed shell over a body
                const beetle = VAR === 'beetle';
                const r = beetle ? new V(RR(0.36, 0.42), RR(0.26, 0.32), RR(0.46, 0.54)) : new V(RR(0.42, 0.5), RR(0.3, 0.36), RR(0.5, 0.58));
                const lift = beetle ? RR(0.18, 0.24) : RR(0.14, 0.2);
                const c = new V(0, lift + r.y * 0.15, 0);
                T.c.copy(c).add(new V(0, r.y * 0.4, 0)); T.r.copy(r);
                // under-body
                put(pivot, paintBody(ell([c.x, c.y, c.z], [r.x * 0.85, r.y * 0.35, r.z * 0.88], { ws: seg(16, 6), hs: seg(8, 4) }), { belly: 0.6 }), 'skin');
                const cells = [];
                cells.push(new V(0, c.y + r.y, 0));
                for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cells.push(new V(Math.cos(a) * r.x * 0.55, c.y + r.y * 0.82, Math.sin(a) * r.z * 0.55)); }
                for (let k = 0; k < 10; k++) { const a = (k + 0.5) / 10 * Math.PI * 2; cells.push(new V(Math.cos(a) * r.x * 0.98, c.y + r.y * 0.35, Math.sin(a) * r.z * 0.98)); }
                const shellC = beetle ? CL.accent : U.mix(CL.main, CL.dark, 0.35);
                put(pivot, paint(ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(24, 8), hs: seg(12, 5), cap: Math.PI * 0.53 }), (p, nn, out) => {
                    out[0] = shellC[0]; out[1] = shellC[1]; out[2] = shellC[2];
                    if (beetle) {
                        mixInto(out, CL.deep, U.smooth((0.03 - Math.abs(p.x)) / 0.02) * 0.9);
                        if (pat === 'spots' || pat === 'speckles' || pat === 'patches') for (const sp of spotPts.slice(0, 7)) { const d = Math.hypot((p.x / r.x) - sp[0] * 0.7, (p.z / r.z) - sp[2] * 0.7); if (d < 0.2) { mixInto(out, CL.deep, U.smooth((0.2 - d) / 0.05)); break; } }
                        else if (pat === 'stripes') mixInto(out, CL.main, ((p.z / r.z * 2.5 + 10) % 1) < 0.35 ? 0.8 : 0);
                        mixInto(out, [1, 1, 1], U.smooth((nn.y - 0.85) / 0.1) * 0.25);
                    } else {
                        let d1 = Infinity, d2 = Infinity;
                        for (const cp of cells) { const d = p.distanceTo(cp); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
                        mixInto(out, CL.accent, U.smooth((d2 - d1) / (r.x * 0.5)) * 0.4);
                        mixInto(out, CL.deep, U.smooth((r.x * 0.09 - (d2 - d1)) / (r.x * 0.05)) * 0.85);
                        mixInto(out, CL.belly, U.smooth(((c.y + r.y * 0.12) - p.y) / (r.y * 0.1)) * 0.6);
                    }
                }), 'skin');
                // head on a short neck
                const nb = new V(0, c.y + r.y * 0.1, -r.z * 0.82);
                const hr = r.y * (beetle ? 0.55 : 0.5);
                const hc = nb.clone().add(new V(0, hr * (beetle ? 0.1 : 0.45), -hr * (beetle ? 0.85 : 1.5)));
                const nj = joint(pivot, nb);
                if (!beetle) limb(nb, hc, hr * 0.6, hr * 0.55, { capB: false }).forEach(g => put(nj, paintBody(g), 'skin'));
                face = makeHead(nj, hc, new V(hr, hr * 0.9, hr * 1.05), { spread: beetle ? 36 : 34, el: beetle ? 14 : 12, eyeR: beetle ? 0.3 : 0.24, snout: beetle ? 'none' : 'none', mouthMin: -30, antTop: beetle ? hc.clone().add(new V(0, hr * 0.8, -hr * 0.4)) : null });
                faceJ = nj; A.neck = { j: nj, graze: !beetle };
                if (beetle) {
                    for (let i = 0; i < 3; i++) {
                        const z = (-0.5 + 0.5 * i) * r.z;
                        [-1, 1].forEach(side => makeBugLeg(pivot, new V(side * r.x * 0.66, c.y - r.y * 0.1, z), side, i * 2.1 + (side > 0 ? Math.PI : 0), r.x * 0.42, 0.22));
                    }
                } else {
                    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (pp, k) {
                        makeLeg(pivot, new V(pp[0] * r.x * 0.62, c.y - r.y * 0.05, pp[1] * r.z * 0.55), { r: r.y * 0.3, foot: r.y * 0.36, twoSeg: false, out: pp[0] * r.x * 0.15, phase: (k === 0 || k === 3) ? 0 : Math.PI, side: pp[0] });
                    });
                    if (s.tail) makeTail(pivot, new V(0, c.y, r.z * 0.9), new V(0, -0.2, 1), r.z * 0.35, r.y * 0.16);
                }
            }
        } else { // flyer
            if (VAR === 'moth') {
                const r = new V(RR(0.12, 0.15), RR(0.13, 0.16), RR(0.32, 0.4));
                const c = new V(0, 0.3, 0);
                T.c.copy(c); T.r.copy(r);
                put(pivot, paintBody(ell([c.x, c.y, c.z + r.z * 0.2], [r.x, r.y, r.z], { ws: seg(14, 6), hs: seg(10, 5), bump: 0.08, bumpF: 9, taper: t => 1 - 0.3 * Math.max(0, t) })), 'skin');
                const hc = new V(0, c.y + r.y * 0.25, -r.z * 0.85), hr = r.x * 1.25;
                face = makeHead(pivot, hc, new V(hr, hr, hr), { spread: 48, el: 6, eyeR: 0.42, snout: 'none', mouthMin: -30, bump: 0.08, antTop: hc.clone().add(new V(0, hr * 0.85, -hr * 0.2)) });
                const span = RR(0.5, 0.65);
                [-1, 1].forEach(side => makeWing(pivot, new V(side * r.x * 0.6, c.y + r.y * 0.4, -r.z * 0.15), side, span, 'bug'));
            } else {
                const bat = VAR === 'bat';
                const r = bat ? new V(RR(0.24, 0.3), RR(0.26, 0.3), RR(0.26, 0.3)) : new V(RR(0.22, 0.28), RR(0.24, 0.3), RR(0.32, 0.4));
                const legsN = s.legs;
                const lift = legsN ? RR(0.2, 0.3) : 0.05;
                const c = new V(0, lift + r.y, 0);
                T.c.copy(c); T.r.copy(r);
                put(pivot, paintBody(ell([c.x, c.y, c.z], [r.x, r.y, r.z], { ws: seg(18, 8), hs: seg(13, 6), bump: bat ? 0.07 : 0, bumpF: 8, quat: new THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), bat ? 0 : -0.25), taper: t => 1 - 0.15 * Math.max(0, t) })), 'skin');
                let hj = pivot;
                if (bat) face = makeHead(pivot, c, r, { faceOnly: true, spread: 26, el: 16, eyeR: 0.24, snout: 'none', mouthMin: -20 });
                else {
                    const nb = new V(0, c.y + r.y * 0.55, -r.z * 0.55), hr = r.x * RR(0.8, 0.95);
                    const hc = nb.clone().add(new V(0, hr * 0.6, -hr * 0.45));
                    hj = joint(pivot, nb);
                    face = makeHead(hj, hc, new V(hr, hr * 0.95, hr), { spread: RR(34, 44), el: 10, eyeR: 0.26, snout: 'beak' });
                    A.head = { j: hj, peck: legsN > 0 };
                }
                faceJ = hj;
                const span = (floaty ? RR(0.65, 0.85) : RR(0.38, 0.48));
                [-1, 1].forEach(side => makeWing(pivot, new V(side * r.x * 0.75, c.y + r.y * 0.3, -r.z * 0.1), side, span, bat ? 'membrane' : 'feather'));
                if (s.tail) makeTail(pivot, new V(0, c.y - r.y * 0.1, r.z * 0.85), new V(0, 0.15, 1), r.z * 0.35, r.x * 0.25);
                if (legsN) [-1, 1].forEach(side => makeLeg(pivot, new V(side * r.x * 0.4, c.y - r.y * 0.7, 0.02), { r: r.x * 0.07, foot: r.x * 0.14, twoSeg: false, out: 0, phase: side > 0 ? Math.PI : 0, side: side }));
            }
        }

        // Glowing creatures always have little glowing spots along their sides (and segments).
        if (s.glow && !person) {
            if (A.segs.length) {
                A.segs.forEach(function (sg, i) {
                    if (i === 0 || i % 2) return;
                    const w = sg.j.userData.w;
                    [-1, 1].forEach(sd => put(sg.j, place(new THREE.SphereGeometry(sg.r * 0.16, seg(6, 4), seg(4, 3)), new V(w.x + sd * sg.r * 0.72, w.y + sg.r * 0.5, w.z)), 'glow'));
                });
            } else {
                const S = surf(T.c, T.r), nD = R.int(2, 4);
                for (let k = 0; k < nD; k++) [-1, 1].forEach(function (sd) {
                    const at = S.at(sd * (B === 'jelly' ? 40 + k * 70 : 75 + k * 28), B === 'jelly' ? 55 : 18 + (k % 2) * 18, -T.r.y * 0.02);
                    put(trunkJ, place(new THREE.SphereGeometry(T.r.y * 0.085, seg(6, 4), seg(4, 3)), at.p), 'glow');
                });
            }
        }

        // ==== people: clothes and gear (look from peopleLook) ====
        function personCol(p, n, out, ty, th) {
            // Outfit over the torso, a collar at the neck, a belt at the waist, skin above.
            const yy = (p.y - ty) / th;
            const neckY = 0.78 + (look.collar === 'high' ? 0.12 : 0);
            if (yy > neckY + 0.12) { out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2]; return out; }
            out[0] = CL.outfit[0]; out[1] = CL.outfit[1]; out[2] = CL.outfit[2];
            mixInto(out, CL.deep, U.smooth((-n.y - 0.3) / 0.6) * 0.3);
            const collarW = look.collar === 'ruff' ? 0.16 : 0.08;
            if (yy > neckY + 0.12 - collarW * 2 && yy < neckY + 0.12) mixInto(out, CL.trim, 0.95);
            if (Math.abs(yy + 0.45) < 0.07) mixInto(out, CL.trim, 0.85);
            if (look.collar === 'v' && yy > neckY - 0.25 && Math.abs(p.x) < (yy - (neckY - 0.25)) * 0.35 && n.z < 0) { out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2]; }
            return out;
        }
        function personSleeve(p, n, out, a, b) {
            out[0] = CL.outfit[0]; out[1] = CL.outfit[1]; out[2] = CL.outfit[2];
            const t = new V().subVectors(p, a).dot(new V().subVectors(b, a)) / Math.max(1e-6, a.distanceToSquared(b));
            if (t > 0.85) mixInto(out, CL.trim, 0.9);
            return out;
        }
        function personHeadShape(hr) {
            switch (look.head) {
                case 'tall': return new V(hr * 0.85, hr * 1.15, hr * 0.9);
                case 'wide': return new V(hr * 1.18, hr * 0.88, hr * 0.95);
                case 'dome': return new V(hr * 0.95, hr * 1.12, hr * 0.98);
                case 'bean': return new V(hr * 0.92, hr * 1.05, hr * 0.85);
                default: return new V(hr, hr, hr * 0.95);
            }
        }
        function makePersonHead(j, hc, hs) {
            const shape = look.head;
            const g = ell([hc.x, hc.y, hc.z], [hs.x, hs.y, hs.z], {
                ws: seg(20, 8), hs: seg(15, 6),
                vtaper: shape === 'pear' ? (t => 0.82 + 0.25 * Math.max(0, -t) + 0.05) : shape === 'heart' ? (t => 1 + 0.12 * Math.max(0, t) - 0.18 * Math.max(0, -t)) : shape === 'dome' ? (t => 1 + 0.08 * Math.max(0, t)) : null
            });
            const pts = [];
            if (look.pattern === 'spots') for (let k = 0; k < 6; k++) pts.push(new V(R.range(-1, 1), R.range(0.1, 1), R.range(-0.2, 1)).normalize());
            put(j, paint(g, function (p, n, out) {
                out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2];
                const u = new V((p.x - hc.x) / hs.x, (p.y - hc.y) / hs.y, (p.z - hc.z) / hs.z);
                mixInto(out, CL.dark, U.smooth((u.y - 0.55) / 0.4) * 0.3);
                if (look.pattern === 'freckles' && u.z < -0.5 && Math.abs(u.y + 0.15) < 0.18 && Math.abs(u.x) > 0.2 && N(p.x * 60, p.y * 60, p.z * 60) > 0.25) mixInto(out, CL.spots, 0.85);
                else if (look.pattern === 'spots') { for (const d of pts) if (u.clone().normalize().dot(d) > 0.94) { mixInto(out, CL.spots, 0.9); break; } }
                else if (look.pattern === 'stripes' && u.y > 0.35 && ((u.x * 3 + 10) % 1) < 0.35) mixInto(out, CL.spots, 0.8);
                else if (look.pattern === 'mask' && u.z < -0.3 && Math.abs(u.y - 0.12) < 0.2) mixInto(out, CL.spots, 0.75);
                if (look.cheeks && u.z < -0.6 && Math.abs(u.y + 0.2) < 0.12 && Math.abs(Math.abs(u.x) - 0.5) < 0.16) mixInto(out, CL.pink, 0.6);
            }), 'skin');
            const H = makeHead(j, hc, hs, {
                faceOnly: true, eyes: look.eyes, eyeR: look.eyes === 1 ? 0.34 : look.eyes === 2 ? 0.25 : 0.2,
                style: look.eyeShape === 'almond' ? 'sleepy' : look.eyeShape === 'oval' ? 'round' : 'bright',
                spread: 28, el: 10, snout: look.nose === 'snout' ? 'muzzle' : 'none', noEars: true, noAntennae: true, noHorns: true, mouthMin: -38
            });
            const fs = Math.min(hs.x, hs.y);
            if (look.nose === 'button' || look.nose === 'dots') {
                const at = H.at(0, -8);
                if (look.nose === 'button') put(j, paintSolid(place(new THREE.SphereGeometry(fs * 0.1, seg(8, 5), seg(6, 4)), at.p), U.mix(CL.main, CL.pink, 0.5)), 'skin');
                else [-1, 1].forEach(sd => put(j, place(new THREE.SphereGeometry(fs * 0.035, seg(6, 4), seg(4, 3)), H.at(sd * 6, -8).p), 'mouth'));
            }
            // Ears.
            if (look.ears !== 'none') [-1, 1].forEach(function (side) {
                const at = H.at(side * 88, 6);
                const ej = joint(j, at.p);
                const k = look.ears;
                const w = fs * (k === 'round' ? 0.26 : k === 'fins' ? 0.1 : 0.16), h = fs * (k === 'round' ? 0.26 : k === 'long' ? 0.75 : k === 'fins' ? 0.42 : 0.5), d = fs * (k === 'fins' ? 0.3 : 0.07);
                const dir = new V(side * (k === 'long' ? 0.9 : 0.75), k === 'long' ? 0.25 : 0.6, 0.15).normalize();
                const ge = ell([0, h * 0.8, 0], [w, h, d], { ws: seg(10, 6), hs: seg(8, 5), vtaper: k === 'round' ? null : (t => 0.5 + 0.5 * Math.cos(Math.max(0, t) * 1.3)) });
                place(ge, at.p, new THREE.Quaternion().setFromUnitVectors(UP, dir));
                put(ej, paint(ge, (p, n, out) => { out[0] = CL.main[0]; out[1] = CL.main[1]; out[2] = CL.main[2]; mixInto(out, CL.pink, U.smooth((-n.z - 0.2) / 0.4) * 0.6); }), 'skin');
                A.ears.push({ j: ej, side: side });
            });
            // Antennae and the top of the head.
            const topP = H.at(0, 88).p;
            for (let k = 0; k < look.antennae; k++) {
                const sd = look.antennae === 1 ? 0 : (k ? 1 : -1);
                const at = H.at(sd * 25, 72);
                const aj = joint(j, at.p);
                const dir = new V(sd * 0.45, 1, 0.1).normalize(), len = fs * 0.75;
                const b = at.p.clone().addScaledVector(dir, len);
                limb(at.p, b, fs * 0.04, fs * 0.03, { radial: seg(6, 4), capB: false }).forEach(gg => put(aj, paintSolid(gg, CL.dark), 'skin'));
                put(aj, paintSolid(place(new THREE.SphereGeometry(fs * 0.1, seg(8, 5), seg(6, 4)), b), CL.accent), 'skin');
                A.ants.push({ j: aj, phase: k * 2.1 });
            }
            if (look.headTop === 'crest' || look.headTop === 'ridge') for (let k = 0; k < (look.headTop === 'crest' ? 3 : 5); k++) {
                const at = H.at(0, 52 + k * (look.headTop === 'crest' ? 16 : 10));
                const ge = ell([0, fs * 0.12, 0], [fs * 0.05, fs * (look.headTop === 'crest' ? 0.2 : 0.1), fs * 0.12], { ws: seg(8, 5), hs: seg(6, 4) });
                put(j, paintSolid(place(ge, at.p, new THREE.Quaternion().setFromUnitVectors(UP, at.n)), CL.accent, 0.3), 'skin');
            } else if (look.headTop === 'tuft') for (let k = 0; k < 5; k++) {
                const at = H.at(R.range(-25, 25), R.range(68, 88));
                put(j, paintSolid(ell([at.p.x, at.p.y + fs * 0.04, at.p.z], [fs * 0.14, fs * 0.15, fs * 0.14], { ws: seg(8, 5), hs: seg(6, 4), bump: 0.12 }), CL.accent, 0.2), 'skin');
            } else if (look.headTop === 'nubs') [-1, 1].forEach(sd => {
                const at = H.at(sd * 30, 66);
                const gc = new THREE.ConeGeometry(fs * 0.09, fs * 0.22, seg(8, 5), 1); gc.translate(0, fs * 0.1, 0);
                put(j, paintSolid(place(gc, at.p, new THREE.Quaternion().setFromUnitVectors(UP, at.n)), CL.horn, 0.2), 'skin');
            });
            H.top = topP;
            return H;
        }
        function personGear(j, hc, hs) {
            const fs = Math.min(hs.x, hs.y);
            const gear = look.headgear;
            if (gear === 'bubble') {
                const g = new THREE.SphereGeometry(Math.max(hs.x, hs.y, hs.z) * 1.32, seg(20, 10), seg(14, 7));
                g.translate(hc.x, hc.y + fs * 0.05, hc.z);
                put(j, paint(g, (p, n, out) => { out[0] = 0.75; out[1] = 0.9; out[2] = 1; mixInto(out, [1, 1, 1], U.smooth((n.y + n.x * 0.5 - 0.6) / 0.3)); }), 'film');
                const ring = new THREE.TorusGeometry(Math.max(hs.x, hs.z) * 1.05, fs * 0.08, seg(6, 4), seg(20, 10));
                ring.rotateX(Math.PI / 2);
                ring.translate(hc.x, hc.y - hs.y * 0.92, hc.z);
                put(j, paintSolid(ring, CL.trim, 0.3), 'skin');
            } else if (gear === 'headset' || gear === 'band') {
                const band = new THREE.TorusGeometry(1, 0.06, seg(6, 4), seg(20, 10), Math.PI);
                band.rotateY(Math.PI / 2);
                band.scale(hs.x * 1.03, hs.y * 1.03, hs.z * 1.03);
                band.translate(hc.x, hc.y + hs.y * 0.05, hc.z);
                put(j, paintSolid(band, gear === 'band' ? CL.trim : CL.deep), 'skin');
                if (gear === 'headset') {
                    const cup = new V(hc.x + hs.x * 1.02, hc.y, hc.z);
                    put(j, paintSolid(place(new THREE.SphereGeometry(fs * 0.17, seg(10, 6), seg(8, 4)), cup, null, new V(0.6, 1, 1)), CL.deep), 'skin');
                    const mic = cup.clone().add(new V(-fs * 0.15, -fs * 0.45, -fs * 0.62));
                    limb(cup, mic, fs * 0.03, fs * 0.03, { radial: seg(5, 4), capB: false }).forEach(g => put(j, paintSolid(g, CL.deep), 'skin'));
                    put(j, place(new THREE.SphereGeometry(fs * 0.07, seg(6, 4), seg(4, 3)), mic), 'glow');
                } else {
                    put(j, place(new THREE.OctahedronGeometry(fs * 0.12, 0), new V(hc.x, hc.y + hs.y * 0.62, hc.z - hs.z * 0.82)), 'glow');
                }
            } else if (gear === 'cap') {
                const g = new THREE.SphereGeometry(1, seg(18, 8), seg(8, 4), 0, Math.PI * 2, 0, Math.PI * 0.42);
                g.scale(hs.x * 1.06, hs.y * 1.06, hs.z * 1.06);
                g.translate(hc.x, hc.y + hs.y * 0.08, hc.z);
                put(j, paintSolid(g, CL.outfit, 0.2), 'skin');
                const brim = ell([hc.x, hc.y + hs.y * 0.42, hc.z - hs.z * 0.9], [hs.x * 0.7, fs * 0.04, hs.z * 0.45], { ws: seg(12, 6), hs: seg(4, 3) });
                put(j, paintSolid(brim, CL.trim), 'skin');
            }
            // A badge on the chest that glows a little.
            const tyP = T.c.y, thP = T.r.y;
            put(pivot, place(new THREE.SphereGeometry(T.r.x * 0.14, seg(8, 5), seg(6, 4)), new V(-T.r.x * 0.42, tyP + thP * 0.4, -T.r.z * 0.92), null, new V(1, 1, 0.45)), 'glow');
        }

        // ==== build the meshes: merge each joint's parts per material ====
        pending.forEach(function (bucket, j) {
            const w = j.userData.w;
            Object.keys(bucket).forEach(function (mname) {
                const list = bucket[mname];
                const m = mat(mname);
                const wantColor = !!m.vertexColors;
                let nv = 0, ni = 0;
                const flats = list.map(function (g) {
                    g.translate(-w.x, -w.y, -w.z);
                    if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
                    nv += g.attributes.position.count; ni += g.index.count;
                    return g;
                });
                const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = wantColor ? new Float32Array(nv * 3) : null;
                const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
                let vo = 0, io = 0;
                flats.forEach(function (g) {
                    const c = g.attributes.position.count;
                    pos.set(g.attributes.position.array, vo * 3);
                    nor.set(g.attributes.normal.array, vo * 3);
                    if (col) { if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + c) * 3); }
                    const ia = g.index.array;
                    for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
                    vo += c; io += ia.length;
                    g.dispose();
                });
                const bg = new THREE.BufferGeometry();
                bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
                if (col) bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
                bg.setIndex(new THREE.BufferAttribute(idx, 1));
                geos.push(bg);
                const mesh = new THREE.Mesh(bg, m);
                if (mname === 'film') mesh.renderOrder = 2;
                j.add(mesh);
                tris += ni / 3;
            });
        });

        // ==== animation ====
        let hover = 0;
        const ph = (s.seed % 1000) / 1000 * Math.PI * 2;
        const rate = 1 / Math.sqrt(Math.max(0.35, s.size));     // big creatures move slower
        let mv = 0, hopP = 0, spinX = 0;
        const hopH = U.clamp(s.size * 0.35, 0.12, 1.2);
        const rest = new Map();
        jointList.forEach(j => rest.set(j, j.position.clone()));

        function update(dt, t, moving) {
            dt = Math.min(Math.max(dt || 0, 0), 0.25);
            t = (t || 0) + ph;
            mv = U.approach(mv, moving ? 1 : 0, 6, dt);
            const w = rate * (2 + 4 * mv);
            let y = hover, sq = 1;
            pivot.rotation.set(0, (1 - mv) * 0.12 * Math.sin(t * 0.4), 0);
            pivot.position.set(0, 0, 0);

            switch (MOVE) {
                case 'hop': {
                    if (moving || hopP > 0) {
                        hopP += dt * rate * 1.3;
                        if (hopP >= 1) hopP = moving ? hopP % 1 : 0;
                    }
                    if (hopP > 0 && hopP < 0.75) {
                        const a = hopP / 0.75;
                        y += hopH * Math.sin(Math.PI * a);
                        sq = 1 + 0.1 * Math.sin(Math.PI * a);
                        pivot.rotation.x = -0.12 * Math.cos(Math.PI * a);
                    } else if (hopP >= 0.75) {
                        sq = 1 - 0.14 * Math.sin(Math.PI * (hopP - 0.75) / 0.25);
                    } else {
                        sq = 1 + 0.02 * Math.sin(t * 2.2);       // breathing
                    }
                    break;
                }
                case 'walk':
                    y += mv * 0.025 * s.size * Math.abs(Math.sin(t * w));
                    pivot.rotation.z = mv * 0.035 * Math.sin(t * w);
                    sq = 1 + 0.015 * Math.sin(t * 2);
                    break;
                case 'crawl':
                    y += mv * 0.012 * s.size * Math.abs(Math.sin(t * w * 1.5));
                    sq = 1 + 0.02 * Math.sin(t * 1.8);
                    if (VAR === 'slug' || VAR === 'snail') pivot.scale.z = 1 + 0.05 * mv * Math.sin(t * w * 1.2);
                    break;
                case 'roll':
                    spinX = (spinX - dt * mv * 3.2 * rate) % (Math.PI * 2);
                    if (A.spin) A.spin.rotation.x = spinX + (1 - mv) * 0.06 * Math.sin(t * 1.5);
                    break;
                case 'slither':
                    break;
                case 'float':
                    y += 0.07 * s.size * Math.sin(t * 0.9);
                    pivot.rotation.z = 0.05 * Math.sin(t * 0.6);
                    pivot.rotation.x = -mv * 0.1;
                    break;
                case 'drift':
                    y += 0.06 * s.size * Math.sin(t * 1.3);
                    pivot.rotation.z = 0.1 * Math.sin(t * 0.8);
                    pivot.rotation.x = -mv * 0.1;
                    break;
            }
            root.position.y = y;
            if (VAR !== 'slug' && VAR !== 'snail') pivot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            else { pivot.scale.x = 1; pivot.scale.y = sq; }

            for (const bj of A.bob) bj.position.y = rest.get(bj).y + (MOVE === 'walk' ? mv * 0.02 * Math.abs(Math.sin(t * w)) : 0);
            if (A.jelly) {
                const pu = Math.sin(t * 2.2);
                A.jelly.scale.set(1 - 0.06 * pu, 1 + 0.07 * pu, 1 - 0.06 * pu);
            }

            // Worm wiggle: a wave runs from head to tail.
            for (let i = 0; i < A.segs.length; i++) {
                const sg = A.segs[i], r0 = rest.get(sg.j);
                const amp = (MOVE === 'slither' ? 0.22 : 0.04) * (0.25 + 0.75 * mv) * sg.r * 2 * (i === 0 ? 0.4 : 1);
                sg.j.position.x = r0.x + amp * Math.sin(t * w * 0.9 - i * 0.9);
                sg.j.position.y = r0.y + (MOVE === 'crawl' ? mv * sg.r * 0.25 * Math.max(0, Math.sin(t * w - i * 0.8)) : 0);
            }

            for (const L of A.legs) {
                const c = t * w + L.phase;
                if (L.kind === 'bug') {
                    L.hj.rotation.set(0, mv * 0.35 * Math.sin(c), L.side * mv * 0.18 * Math.max(0, Math.cos(c)));
                } else if (L.kind === 'frog') {
                    const tuck = MOVE === 'hop' && hopP > 0 && hopP < 0.75 ? Math.sin(Math.PI * hopP / 0.75) : 0;
                    L.hj.rotation.set(-0.5 * tuck, 0, 0);
                    if (L.kj) L.kj.rotation.set(0.8 * tuck, 0, 0);
                } else if (MOVE === 'hop') {
                    const air = hopP > 0 && hopP < 0.75 ? Math.sin(Math.PI * hopP / 0.75) : 0;
                    L.hj.rotation.set(0.3 * air, 0, L.side * 0.05);
                    if (L.kj) L.kj.rotation.set(-0.4 * air, 0, 0);
                } else {
                    const swing = mv * (MOVE === 'crawl' ? 0.4 : 0.5) * Math.sin(c);
                    L.hj.rotation.set(swing, 0, L.side * 0.04);
                    if (L.kj) L.kj.rotation.set(mv * 0.55 * Math.max(0, Math.sin(c + 1.4)) * (L.kj ? 1 : 0), 0, 0);
                }
            }
            for (const Ar of A.arms) {
                if (Ar.mitt) {
                    Ar.j.rotation.set(0.12 * Math.sin(t * 1.3 + Ar.phase) - mv * 0.1, 0, Ar.side * 0.1 * Math.sin(t * 2 + Ar.phase));
                    continue;
                }
                if (Ar.wave) {
                    // A friendly wave: the arm up, the forearm swinging side to side.
                    Ar.j.rotation.set(-0.25, 0, 2.3);
                    Ar.ej.rotation.set(0, 0, 0.55 + 0.45 * Math.sin(t * 6));
                } else {
                    Ar.j.rotation.set(mv * 0.4 * Math.sin(t * w + Ar.phase) + 0.05 * Math.sin(t * 1.3 + Ar.phase), 0, Ar.side * 0.12);
                    Ar.ej.rotation.set(-0.2 - 0.15 * mv, 0, 0);
                }
            }
            for (const T2 of A.tents) {
                const sw = T2.hanging ? 0.16 * Math.sin(t * (A.jelly ? 2.2 : 1.4) - T2.phase * 0.3) : mv * 0.25 * Math.sin(t * w + T2.phase) + 0.06 * Math.sin(t * 1.3 + T2.phase);
                for (let k = 0; k < T2.joints.length; k++) {
                    const a = k === 0 ? sw : sw * 0.6 * Math.sin(t * 1.7 + k + T2.phase) + (T2.hanging ? 0.06 : 0);
                    T2.joints[k].quaternion.setFromAxisAngle(T2.axis, a);
                }
            }
            for (const E of A.lids) {
                const b = ((t + E.off) % blinkEvery + blinkEvery) % blinkEvery;
                const close = b > blinkEvery - 0.16 ? Math.sin(Math.PI * (b - (blinkEvery - 0.16)) / 0.16) : 0;
                E.j.quaternion.setFromAxisAngle(E.axis, E.rest + (-Math.PI / 2 - E.rest) * close);
            }
            for (const S of A.stalks) S.j.rotation.set(0.08 * Math.sin(t * 2.1 + S.phase), 0, 0.1 * Math.sin(t * 1.7 + S.phase));
            for (const An of A.ants) An.j.rotation.set(0.08 * Math.sin(t * (An.slow ? 1 : 2.3) + An.phase), 0, 0.1 * Math.sin(t * (An.slow ? 0.8 : 3) + An.phase) + mv * 0.06 * Math.sin(t * 9 + An.phase));
            for (const Ea of A.ears) {
                const flick = (Math.sin(t * 0.7 + Ea.side) > 0.96) ? 0.25 * Math.sin(t * 30) : 0;
                Ea.j.rotation.z = Ea.side * (0.05 * Math.sin(t * 1.6 + Ea.side) + flick) - (MOVE === 'hop' && hopP > 0 ? Ea.side * 0.12 : 0);
            }
            if (A.tail.length) for (let k = 0; k < A.tail.length; k++) {
                A.tail[k].rotation.y = (0.12 + 0.18 * mv) * Math.sin(t * (2.5 + 4 * mv) - k * 0.6);
                A.tail[k].rotation.x = 0.04 * Math.sin(t * 1.6 + k);
            }
            for (const Wi of A.wings) {
                let f;
                if (floaty) f = Wi.kind === 'bug' ? 0.55 + 0.45 * Math.sin(t * 5) : 0.15 + 0.55 * Math.sin(t * (MOVE === 'drift' ? 7 : 3.2));
                else f = -0.1 + 0.25 * Math.max(0, Math.sin(t * 6)) * (Math.sin(t * 0.7) > 0.7 ? 1 : 0);
                Wi.j.rotation.set(0, 0, Wi.side * f);
            }
            for (const F of A.fins) F.j.rotation.set(0, 0, F.side * (F.ray ? 0.22 + 0.32 * Math.sin(t * 1.6) : 0.25 * Math.sin(t * 2)));
            // Necks nod while walking; grazers dip their heads to nibble now and then.
            if (A.neck) {
                const graze = A.neck.graze ? U.smooth((Math.sin(t * 0.35) - 0.55) / 0.3) * (1 - mv) : 0;
                A.neck.j.rotation.set(mv * 0.05 * Math.sin(t * w * 2) + graze * 0.7, (1 - mv) * 0.18 * Math.sin(t * 0.5) * (1 - graze), 0);
            }
            if (A.head) {
                const peck = A.head.peck ? U.smooth((Math.sin(t * 0.9) - 0.7) / 0.2) * (1 - mv) : 0;
                A.head.j.rotation.set(mv * 0.04 * Math.sin(t * w * 2) + peck * 0.6, (1 - mv) * 0.25 * Math.sin(t * 0.45), 0.04 * Math.sin(t * 0.7));
            }
        }

        // --- size it: measure in the rest pose, scale to spec.size, feet on the ground, centred ---
        update(0, -ph, false);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const nh = Math.max(1e-3, box.max.y - box.min.y);
        const scale = s.size / nh;
        rig.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        root.scale.setScalar(scale);
        hover = floaty ? (MOVE === 'float' ? 0.5 + 0.35 * s.size : 0.3 + 0.2 * s.size) : 0;
        const height = nh * scale;
        const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 * scale;
        const fw = face && faceJ ? faceJ.userData.w.clone() : new V(0, nh * 0.6, 0);
        const fc = face ? face.c : fw;
        const focus = { x: (fc.x + rig.position.x) * scale, y: (fc.y + rig.position.y) * scale + hover, z: (fc.z + rig.position.z) * scale };

        function dispose() {
            geos.forEach(g => g.dispose());
            mats.forEach(m => m.dispose());
            geos.length = 0; mats.length = 0;
            if (group.parent) group.parent.remove(group);
        }

        update(0, -ph, false);          // leave it in the measured rest pose
        return {
            tris: tris,
            api: {
                group: group,
                height: height,
                radius: radius,
                /** Hover height of floaters above the origin (0 for walkers). */
                hover: hover,
                /** The middle of the face, in group space: where a scanner camera should look. */
                focus: focus,
                update: update,
                dispose: dispose
            }
        };
    }

    return {
        BODIES: BODIES,
        MOVES: MOVES,
        PATTERNS: PATTERNS,
        FACTS: FACTS,
        TYPE_FACTS: TYPE_FACTS,
        GLOW_FACTS: GLOW_FACTS,
        SOUNDS: SOUNDS,
        spec: spec,
        words: words,
        peopleLook: peopleLook,
        build: build
    };
})();
