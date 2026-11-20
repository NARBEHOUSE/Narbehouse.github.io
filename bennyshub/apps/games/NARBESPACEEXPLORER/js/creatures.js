/**
 * NARBE Space Explorer - creatures, built from parts (spec headless, build needs THREE).
 *
 *   spec(seed, world)          what a creature is: body, legs, eyes, colours, size, how it
 *                              moves and the funny words the scanner says about it.
 *                              Same seed + same world type = the same creature, always.
 *   build(THREE, spec, detail) a low-poly toy model of it, with update() for its little
 *                              animations (legs, hops, bobbing, blinking, wagging).
 *   words(spec)                the scanner's lines, in order.
 *
 * Every creature is friendly: big round eyes with shiny pupils, a smile, soft round
 * shapes, no teeth, claws or spikes. Bright colours that stand out on the ground.
 *
 * Loads in plain Node too (the tests): no DOM, and THREE is only used inside build(),
 * passed in by the caller. Plain Mesh + Lambert/Basic materials (the CPU test renderer
 * understands those), no textures and no custom shaders.
 */

window.NSE = window.NSE || {};

NSE.Creatures = (function () {
    'use strict';

    const U = NSE.Util;

    const BODIES = ['blob', 'long', 'tall', 'flat', 'worm', 'jelly', 'cube', 'star'];
    const MOVES = ['hop', 'drift', 'crawl', 'float', 'walk', 'roll', 'slither'];

    // --- what lives where -------------------------------------------------------------------------

    const BODY_BY_TYPE = {
        ice: [['blob', 4], ['tall', 3], ['long', 2], ['flat', 1.5], ['worm', 1], ['cube', 1], ['star', 0.8], ['jelly', 0.6]],
        ocean: [['blob', 3], ['flat', 3], ['jelly', 3], ['worm', 2.5], ['long', 2], ['tall', 1], ['star', 1.5], ['cube', 0.5]],
        earth: [['blob', 3], ['long', 2.5], ['tall', 2.5], ['flat', 1.5], ['worm', 1.5], ['cube', 1], ['star', 1], ['jelly', 1]],
        desert: [['blob', 3], ['long', 2.5], ['tall', 2], ['flat', 2], ['worm', 2], ['cube', 1], ['star', 1], ['jelly', 0.4]],
        lava: [['blob', 3], ['cube', 2], ['long', 2], ['tall', 1.5], ['worm', 2], ['flat', 1.5], ['star', 1], ['jelly', 0.5]],
        crystal: [['cube', 4], ['star', 4], ['blob', 1.5], ['tall', 1], ['flat', 0.8], ['jelly', 1], ['long', 0.6], ['worm', 0.5]],
        toxic: [['blob', 3], ['worm', 2.5], ['jelly', 2.5], ['flat', 2], ['long', 1.5], ['tall', 1], ['cube', 0.6], ['star', 0.6]],
        gas: [['jelly', 5], ['blob', 3], ['flat', 2], ['long', 1.2], ['star', 1]],
        rock: [['blob', 3], ['flat', 3], ['cube', 2], ['worm', 2], ['star', 1], ['tall', 0.5]]
    };

    /** Which ways each body can get about (a body with no legs never walks; only balls roll). */
    const MOVE_BY_BODY = {
        blob: [['hop', 4], ['walk', 3], ['roll', 2], ['crawl', 1.2], ['float', 1]],
        long: [['walk', 4], ['crawl', 2.5], ['hop', 1], ['float', 0.6]],
        tall: [['walk', 4], ['hop', 2.5]],
        flat: [['crawl', 4], ['hop', 1.5], ['float', 1.2], ['drift', 0.8]],
        worm: [['slither', 5], ['crawl', 2], ['hop', 0.8]],
        cube: [['hop', 4], ['walk', 2.5], ['crawl', 1], ['drift', 1]],
        star: [['hop', 3], ['walk', 2.5], ['float', 1.5], ['drift', 1]],
        jelly: [['float', 1], ['drift', 1]]
    };

    /** The world nudges the choice: swimmers in the sea, crawlers on moons, floating gems. */
    const MOVE_MOD = {
        ocean: { float: 2.5, slither: 1.5 },
        rock: { crawl: 2, hop: 1.5, float: 0.3, drift: 0.3, walk: 0.7 },
        crystal: { float: 1.6, drift: 2 },
        ice: { walk: 1.4, roll: 1.5 },
        desert: { roll: 1.5, slither: 1.3 },
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
        'It likes to watch the sunset with its family.'
    ];

    const TYPE_FACTS = {
        ice: ['It makes snow angels every morning.', 'It keeps warm by wiggling a lot.', 'It thinks snowballs are a kind of fruit.', 'It loves sliding down icy hills.'],
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

    // --- small colour helpers --------------------------------------------------------------------

    function hslOf(c) {
        const r = c[0], g = c[1], b = c[2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        let h = 0, s = 0;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return [h, s, l];
    }

    function colours(r, type, pal, glow) {
        const ground = hslOf(U.hex(pal.mid));
        let h, s, l, ah;
        switch (type) {
            case 'lava':
                h = r.chance(0.8) ? r.range(-15, 48) : r.range(300, 330); s = r.range(0.78, 0.95); l = r.range(0.55, 0.64);
                ah = r.range(45, 60); break;
            case 'toxic':
                h = r.range(55, 135); s = r.range(0.7, 0.9); l = r.range(0.55, 0.66);
                ah = r.chance(0.5) ? r.range(285, 320) : r.range(172, 195); break;
            case 'crystal':
                // A neighbouring gem colour, far enough round the wheel to stand out on the crystals.
                h = ground[0] + r.sign() * r.range(75, 140); s = r.range(0.65, 0.9); l = r.range(0.6, 0.7);
                ah = h + r.range(150, 210); break;
            case 'ice':
                // Pale and soft like fur, in warm tints so they show up against the snow.
                h = r.pick([r.range(330, 360), r.range(0, 35), r.range(260, 300), r.range(140, 170)]); s = r.range(0.55, 0.75); l = r.range(0.7, 0.78);
                ah = h + r.range(140, 220); break;
            case 'gas':
                h = r.range(0, 360); s = r.range(0.6, 0.8); l = r.range(0.6, 0.7);
                ah = h + r.sign() * r.range(100, 160); break;
            case 'rock':
                h = r.range(0, 360); s = r.range(0.65, 0.85); l = r.range(0.55, 0.64);
                ah = h + r.sign() * r.range(100, 160); break;
            default:
                // Opposite the ground's colour, so it stands out on the land.
                h = ground[0] + 180 + r.range(-55, 55); s = r.range(0.62, 0.85); l = r.range(0.52, 0.64);
                ah = h + r.sign() * r.range(100, 160);
        }
        const main = U.mix(U.hsl(h, s, l), U.hex(pal.high), 0.12);
        const belly = U.mix(main, U.mix([1, 1, 1], U.hex(pal.peak), 0.3), 0.5);
        const accent = U.hsl(ah, glow ? 0.95 : 0.85, glow ? 0.6 : 0.55);
        const eye = r.pick(['#1b1b2f', '#24163a', '#14243a', '#3a2418', '#101018', '#1a2e24']);
        return { main: U.toHex(main), belly: U.toHex(belly), accent: U.toHex(accent), eye: eye };
    }

    // --- the spec -------------------------------------------------------------------------------

    function legsFor(r, body, move, type) {
        if (body === 'jelly') return r.chance(0.85) ? [r.int(3, 8), 'tentacle'] : [0, 'tentacle'];
        switch (move) {
            case 'walk':
                if (body === 'long') return [r.weighted([[4, 4], [6, 2], [8, 1]]), r.chance(0.7) ? 'stubby' : 'stick'];
                if (body === 'flat') return [r.weighted([[4, 3], [6, 2]]), 'stubby'];
                if (body === 'star') return [2, 'stick'];
                if (body === 'cube') return [r.weighted([[2, 3], [4, 2]]), r.chance(0.7) ? 'stubby' : 'stick'];
                return [r.weighted([[2, 6], [3, 1], [4, 2.5]]), body === 'tall' ? (r.chance(0.75) ? 'stick' : 'stubby') : (r.chance(0.5) ? 'stick' : 'stubby')];
            case 'crawl':
                if (body === 'worm') return [r.pick([6, 8]), 'stubby'];
                if (body === 'long') return [r.weighted([[6, 3], [8, 2], [4, 1]]), 'stubby'];
                if (body === 'flat') {
                    const k = r.weighted([['none', 3], ['tentacle', 3.5], ['stubby', 3]]);
                    if (k === 'none') return [0, 'stubby'];
                    if (k === 'tentacle') return [r.int(4, 8), 'tentacle'];
                    return [r.pick([6, 8]), 'stubby'];
                }
                if (body === 'blob') return r.chance(0.6) ? [r.int(4, 8), 'tentacle'] : [6, 'stubby'];
                return [r.pick([4, 6]), 'stubby'];
            case 'hop':
                if (r.chance(0.55)) return [0, 'stubby'];
                return [2, body === 'tall' || body === 'star' ? 'stick' : (r.chance(0.5) ? 'stick' : 'stubby')];
            case 'float':
            case 'drift': {
                const p = { blob: 0.4, flat: 0.2, cube: 0.25 }[body] || 0;
                return r.chance(p) ? [r.int(3, 6), 'tentacle'] : [0, 'tentacle'];
            }
            default:
                return [0, 'stubby'];
        }
    }

    function sizeFor(r, type, body) {
        let bands = [[[0.3, 0.6], 3], [[0.6, 1.2], 4], [[1.2, 2.2], 3], [[2.2, 4], 1.4], [[4, 6], 0.5]];
        if (type === 'rock') bands = [[[0.3, 0.6], 4], [[0.6, 1.2], 3]];
        else if (type === 'gas') bands = [[[1.5, 3], 3], [[3, 6], 2]];
        else if (body === 'jelly') bands = [[[0.5, 1.2], 2], [[1.2, 2.5], 3], [[2.5, 5], 2]];
        else if (body === 'worm') bands = [[[0.3, 0.6], 4], [[0.6, 1.2], 3], [[1.2, 2.5], 1]];
        const b = r.weighted(bands);
        return Math.round(U.clamp(r.range(b[0], b[1]), 0.3, 6) * 100) / 100;
    }

    function sizeWordsFor(size) {
        for (const w of SIZE_WORDS) if (size < w[0]) return w[1];
        return SIZE_WORDS[SIZE_WORDS.length - 1][1];
    }

    function moveWordsFor(r, s, type) {
        switch (s.move) {
            case 'walk':
                if (s.legs === 2) return r.pick(['It waddles about.', 'It walks on two legs.', 'It toddles along.']);
                if (s.legs >= 6) return r.pick(['It walks on lots of little legs.', 'It trots along on all its legs.']);
                return r.pick(['It walks.', 'It trots along.', 'It strolls about.']);
            case 'crawl':
                if (s.legs === 0) return r.pick(['It glides along very slowly.', 'It inches along.']);
                if (s.legKind === 'tentacle') return r.pick(['It wiggles along on its tentacles.', 'It crawls on its wiggly arms.']);
                return r.pick(['It crawls.', 'It scuttles along on lots of little feet.', 'It shuffles about.']);
            case 'hop':
                if (s.legs === 2) return r.pick(['It hops on two springy legs.', 'It hops.', 'It bounces along.']);
                return r.pick(['It hops.', 'It bounces along like a ball.', 'It boings around.']);
            case 'roll': return r.pick(['It rolls.', 'It rolls around like a beach ball.', 'It rolls everywhere it goes.']);
            case 'slither': return r.pick(['It wiggles along.', 'It slithers.', 'It wriggles about.']);
            case 'float':
                if (type === 'ocean') return r.pick(['It floats.', 'It floats along like a bubble.', 'It bobs gently up and down.']);
                return r.pick(['It floats.', 'It floats like a balloon.', 'It bobs gently up and down.']);
            case 'drift':
                if (s.wings) return r.pick(['It flutters along on little wings.', 'It drifts along.']);
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
        if (type === 'gas' || body === 'jelly') move = r.chance(0.5) ? 'float' : 'drift';
        else {
            const mod = MOVE_MOD[type] || {};
            move = r.weighted(MOVE_BY_BODY[body].map(p => [p[0], p[1] * (mod[p[0]] || 1)]));
        }
        const lk = legsFor(r, body, move, type);
        let legs = lk[0];
        const legKind = lk[1];

        const eyes = r.weighted([[1, 2], [2, 6], [3, 2.5], [4, 1], [5, 0.7], [6, 0.4], [7, 0.3]]);
        const eyeStalks = r.chance(body === 'flat' || body === 'worm' ? 0.45 : 0.2);
        let antennae = r.weighted([[0, 5], [1, 2], [2, 3], [3, 0.6]]);
        if (eyeStalks || eyes >= 5) antennae = Math.min(antennae, 1);
        const ears = body !== 'jelly' && body !== 'star' && r.chance(type === 'ice' ? 0.6 : 0.35);
        const tail = body !== 'jelly' && body !== 'worm' && r.chance(0.45);
        const floaty = move === 'float' || move === 'drift';
        let wings = body !== 'jelly' && body !== 'worm' && r.chance(move === 'drift' ? 0.8 : floaty ? 0.6 : 0.12);
        if (legs >= 6) wings = false;
        const pattern = r.weighted([['spots', 4], ['stripes', 3], ['plain', 3]]);
        const glow = r.chance({ lava: 0.65, toxic: 0.6, crystal: 0.55, ocean: 0.12, gas: 0.2 }[type] || 0);
        const colors = colours(r, type, pal, glow);
        const size = sizeFor(r, type, body);

        const s = {
            seed: seed,
            name: NSE.Universe.creatureName(seed),
            worldType: type,
            body: body,
            legs: legs,
            legKind: legKind,
            eyes: eyes,
            eyeStalks: eyeStalks,
            antennae: antennae,
            ears: ears,
            tail: tail,
            wings: wings,
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

    // --- the model ------------------------------------------------------------------------------

    const QUALITY = { high: 1, standard: 0.72, low: 0.48 };
    const TRI_CAP = { high: 2500, standard: 1700, low: 1400 };

    /** Eye spots on a face, [azimuth, elevation] in degrees; 0,0 = straight ahead. */
    const EYE_LAYOUT = [
        [[0, 20]],
        [[-24, 22], [24, 22]],
        [[-30, 15], [0, 32], [30, 15]],
        [[-34, 13], [-12, 32], [12, 32], [34, 13]],
        [[-36, 11], [0, 13], [36, 11], [-18, 35], [18, 35]],
        [[-38, 10], [0, 11], [38, 10], [-25, 34], [0, 42], [25, 34]],
        [[-42, 9], [-14, 10], [14, 10], [42, 9], [-27, 33], [0, 42], [27, 33]]
    ];
    /** Eye size against the face, by how many eyes share it. */
    const EYE_R = [0.44, 0.33, 0.26, 0.22, 0.19, 0.17, 0.16];

    /**
     * A toy model of a creature. Origin at its feet (floaters hover above it), facing -Z,
     * height = spec.size metres. update(dt, t, moving) animates its parts only.
     */
    function build(THREE, s, detail) {
        detail = QUALITY[detail] ? detail : 'standard';
        let q = QUALITY[detail], out = null;
        for (let k = 0; k < 6; k++) {
            out = assemble(THREE, s, q);
            if (out.tris <= TRI_CAP[detail] || q <= 0.16) break;
            out.api.dispose();
            q = Math.max(0.16, q - 0.14);
        }
        out.api.triangles = out.tris;
        return out.api;
    }

    function assemble(THREE, s, q) {
        const V = THREE.Vector3;
        const R = U.rng(U.hash('creature-build', s.seed));
        const geos = [], mats = [], gcache = new Map();
        let tris = 0;
        const UP = new V(0, 1, 0), NEG_Z = new V(0, 0, -1);
        const seg = (n, min) => Math.max(min || 3, Math.round(n * q));
        const keep = g => { geos.push(g); return g; };
        const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

        function cached(key, make) {
            if (!gcache.has(key)) gcache.set(key, keep(make()));
            return gcache.get(key);
        }
        const sphereG = (ws, hs) => cached('s' + ws + 'x' + hs, () => new THREE.SphereGeometry(1, ws, hs));
        /** Unit cylinder, open ends; 'up' spans y 0..1 (narrow top), 'down' spans 0..-1 (narrow bottom). */
        const cylG = (radial, down, taper) => cached('c' + radial + (down ? 'd' : 'u') + taper, function () {
            const g = down ? new THREE.CylinderGeometry(1, taper, 1, radial, 1, true) : new THREE.CylinderGeometry(taper, 1, 1, radial, 1, true);
            g.translate(0, down ? -0.5 : 0.5, 0);
            return g;
        });

        function mesh(geo, mat, parent, pos, scale) {
            const m = new THREE.Mesh(geo, mat);
            if (pos) m.position.set(pos[0], pos[1], pos[2]);
            if (scale !== undefined) { if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(scale[0], scale[1], scale[2]); }
            parent.add(m);
            tris += triCount(geo);
            return m;
        }

        // --- materials (shared by every part of this one creature) ---
        const flat = s.body === 'cube' || s.body === 'star' || s.worldType === 'crystal';
        function lam(color, extra) {
            const m = new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: flat }, extra || {}));
            mats.push(m); return m;
        }
        function basic(color) { const m = new THREE.MeshBasicMaterial({ color: color }); mats.push(m); return m; }
        const C = s.colors;
        const M = {
            main: lam(C.main),
            belly: lam(C.belly),
            accent: lam(C.accent, s.glow ? { emissive: C.accent, emissiveIntensity: 0.85 } : null),
            white: basic('#ffffff'),
            pupil: basic(C.eye),
            mouth: lam('#4a1f33', { flatShading: false }),
            cheek: lam('#ff8fb3', { flatShading: false })
        };
        // A little inner glow on the body too, so glowing creatures read as glowing.
        if (s.glow) { M.main.emissive = new THREE.Color(C.main); M.main.emissiveIntensity = 0.12; }

        // --- the pattern: each body triangle is main, belly or accent (spots / stripes) ---
        const spotDirs = [];
        if (s.pattern === 'spots') {
            const n = R.int(5, 9);
            for (let k = 0; spotDirs.length < n && k < 80; k++) {
                const z = R.range(-1, 1), a = R.range(0, Math.PI * 2), rr = Math.sqrt(1 - z * z);
                const d = [rr * Math.cos(a), z, rr * Math.sin(a)];
                if (d[2] < -0.5 && d[1] > -0.4) continue;          // never on the face
                if (d[1] < -0.65) continue;                          // nor underneath
                if (spotDirs.some(o => o[0] * d[0] + o[1] * d[1] + o[2] * d[2] > 0.8)) continue;
                spotDirs.push(d);
            }
        }
        const spotCos = Math.cos(R.range(0.3, 0.42));
        const stripeFreq = R.range(2.6, 3.6), stripeOff = R.range(0, 1);

        function classify(u, o) {
            if (o.force !== undefined) return o.force;
            if (o.belly === 'front' && u[2] < -0.5 && u[1] < 0.2 && u[1] > -0.92 && Math.abs(u[0]) < 0.62) return 1;
            if (o.belly === 'under' && u[1] < -0.45) return 1;
            if (s.pattern === 'spots') {
                const L = Math.hypot(u[0], u[1], u[2]) || 1, x = u[0] / L, y = u[1] / L, z = u[2] / L;
                if (o.face && z < -0.5 && y > -0.4) return 0;
                for (const d of spotDirs) if (x * d[0] + y * d[1] + z * d[2] > spotCos) return 2;
            } else if (s.pattern === 'stripes' && !o.noStripes) {
                const a = o.axis === 'z' ? u[2] : u[1];
                const f = (((a + 1) * stripeFreq * 0.5 + stripeOff) % 1 + 1) % 1;
                if (f < 0.4) return 2;
            }
            return 0;
        }

        /** Split one geometry into main / belly / accent meshes by triangle (no textures needed). */
        function patterned(geo, parent, centre, radii, o) {
            if (!o.quads && geo.userData.quads) o = Object.assign({ quads: geo.userData.quads }, o);
            const g = geo.index ? geo.toNonIndexed() : geo;
            if (g !== geo) geo.dispose();
            const pos = g.attributes.position.array, nor = g.attributes.normal.array;
            const buckets = [[], [], []];
            // Colour whole quads (both triangles together) so bands and spots have straight
            // edges, not a zig-zag. Boxes are all quads; a sphere's first row (and its last,
            // when it is closed) is single triangles, every other row is quads.
            const nt = pos.length / 9;
            let single = () => true;
            if (o.quads === 'box') single = () => false;
            else if (o.quads) {
                const w = o.quads[0], first = w, last = o.quads[2] ? nt : nt - w;
                single = t => t < first || t >= last;
            }
            for (let t = 0; t < nt;) {
                const n = single(t) || t + 1 >= nt ? 1 : 2, i = t * 9, u = [0, 0, 0];
                for (let v = 0; v < n * 3; v++) for (let c = 0; c < 3; c++) u[c] += pos[i + v * 3 + c];
                for (let c = 0; c < 3; c++) u[c] = (u[c] / (n * 3) - centre[c]) / radii[c];
                const k = classify(u, o);
                for (let j = 0; j < n; j++) buckets[k].push(i + j * 9);
                t += n;
            }
            const mm = [M.main, M.belly, M.accent], out = [];
            buckets.forEach(function (list, k) {
                if (!list.length) return;
                const p = new Float32Array(list.length * 9), n = new Float32Array(list.length * 9);
                list.forEach(function (i, j) {
                    for (let c = 0; c < 9; c++) { p[j * 9 + c] = pos[i + c]; n[j * 9 + c] = nor[i + c]; }
                });
                const bg = new THREE.BufferGeometry();
                bg.setAttribute('position', new THREE.BufferAttribute(p, 3));
                bg.setAttribute('normal', new THREE.BufferAttribute(n, 3));
                out.push(mesh(keep(bg), mm[k], parent));
            });
            g.dispose();
            return out;
        }

        function ellipsoidGeo(rx, ry, rz, ws, hs, cx, cy, cz) {
            const g = new THREE.SphereGeometry(1, ws, hs);
            g.scale(rx, ry, rz); g.translate(cx, cy, cz);
            g.userData.quads = [ws, hs, false];
            return g;
        }

        // --- surfaces: where on a body a part goes, and which way it points ---
        function ellSurf(c, r) {
            return {
                c: c, r: r, size: (r[0] + r[1]) / 2,
                at: function (az, el) {
                    az *= Math.PI / 180; el *= Math.PI / 180;
                    const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = -Math.cos(az) * Math.cos(el);
                    const t = 1 / Math.sqrt((dx / r[0]) ** 2 + (dy / r[1]) ** 2 + (dz / r[2]) ** 2);
                    const p = new V(c[0] + dx * t, c[1] + dy * t, c[2] + dz * t);
                    const n = new V(dx * t / (r[0] * r[0]), dy * t / (r[1] * r[1]), dz * t / (r[2] * r[2])).normalize();
                    return { p: p, n: n };
                }
            };
        }
        function boxSurf(c, h) {
            return {
                c: c, r: h, size: Math.min(h[0], h[1]) * 1.05,
                at: function (az, el) {
                    az *= Math.PI / 180; el *= Math.PI / 180;
                    const d = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
                    let t = Infinity, axis = 0;
                    for (let i = 0; i < 3; i++) { const ti = Math.abs(d[i]) > 1e-6 ? h[i] / Math.abs(d[i]) : Infinity; if (ti < t) { t = ti; axis = i; } }
                    const n = new V(0, 0, 0); n.setComponent(axis, Math.sign(d[axis]));
                    return { p: new V(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t), n: n };
                }
            };
        }

        // --- the rig ---
        const group = new THREE.Group();
        group.name = 'creature';
        const root = new THREE.Group(); root.name = 'body';
        const rig = new THREE.Group();
        const pivot = new THREE.Group();
        const spin = new THREE.Group();
        group.add(root); root.add(rig); rig.add(pivot); pivot.add(spin);

        const floaty = s.move === 'float' || s.move === 'drift';
        const hanging = s.legKind === 'tentacle' && (floaty || s.body === 'jelly');
        const tentLen = R.range(0.55, 0.75);
        let lift = 0;
        if (s.legs > 0) {
            if (s.legKind === 'stick') lift = R.range(0.42, 0.55);
            else if (s.legKind === 'stubby') lift = s.body === 'worm' ? 0.08 : R.range(0.15, 0.2);
            else lift = hanging ? tentLen * 0.92 : 0.16;
        }

        // Animation handles.
        const A = { legs: [], tents: [], ants: [], ears: [], wings: [], eyes: [], stalks: [], segs: [], tail: null };

        // --- bodies ---
        let face, trunk, hipY, faceParent = pivot, eyeEl = 0, azScale = 1, mouthMinEl = -8;
        const B = s.body;
        const ws = seg(22, 8), hs = seg(16, 6);
        if (B === 'blob') {
            const r = [R.range(0.46, 0.54), R.range(0.42, 0.5), R.range(0.42, 0.48)], c = [0, lift + r[1], 0];
            spin.position.set(c[0], c[1], c[2]);
            patterned(ellipsoidGeo(r[0], r[1], r[2], ws, hs, 0, 0, 0), spin, [0, 0, 0], r, { belly: 'front', axis: 'y', face: true });
            trunk = face = ellSurf(c, r);
        } else if (B === 'long') {
            const r = [R.range(0.34, 0.4), R.range(0.3, 0.35), R.range(0.66, 0.8)], c = [0, lift + r[1], 0];
            patterned(ellipsoidGeo(r[0], r[1], r[2], seg(20, 8), seg(14, 6), c[0], c[1], c[2]), pivot, c, r, { belly: 'under', axis: 'z' });
            const hr = R.range(0.3, 0.35), hc = [0, c[1] + r[1] * 0.75, -r[2] - hr * 0.35];
            patterned(ellipsoidGeo(hr, hr * 0.95, hr, seg(18, 8), seg(13, 6), hc[0], hc[1], hc[2]), pivot, hc, [hr, hr, hr], { belly: 'front', axis: 'y', face: true, noStripes: true });
            trunk = ellSurf(c, r); face = ellSurf(hc, [hr, hr * 0.95, hr]);
        } else if (B === 'tall') {
            const r = [R.range(0.4, 0.46), R.range(0.45, 0.55), R.range(0.38, 0.42)], c = [0, lift + r[1], 0];
            patterned(ellipsoidGeo(r[0], r[1], r[2], seg(20, 8), seg(14, 6), c[0], c[1], c[2]), pivot, c, r, { belly: 'front', axis: 'y' });
            const hr = R.range(0.32, 0.36), hc = [0, c[1] + r[1] + hr * 0.62, -0.03];
            patterned(ellipsoidGeo(hr, hr, hr * 0.96, seg(18, 8), seg(13, 6), hc[0], hc[1], hc[2]), pivot, hc, [hr, hr, hr], { belly: 'none', axis: 'y', face: true });
            trunk = ellSurf(c, r); face = ellSurf(hc, [hr, hr, hr * 0.96]);
        } else if (B === 'flat') {
            const r = [R.range(0.56, 0.64), R.range(0.22, 0.27), R.range(0.5, 0.58)], c = [0, lift + r[1], 0];
            patterned(ellipsoidGeo(r[0], r[1], r[2], ws, seg(12, 6), c[0], c[1], c[2]), pivot, c, r, { belly: 'under', axis: 'z', face: true });
            trunk = face = ellSurf(c, r);
            eyeEl = 28; azScale = 0.8; mouthMinEl = -20;
        } else if (B === 'worm') {
            const n = R.int(5, 7), r0 = R.range(0.28, 0.32);
            let z = 0, prevR = r0;
            for (let i = 0; i < n; i++) {
                const ri = i === 0 ? r0 : r0 * 0.84 * Math.pow(0.93, i - 1);
                if (i > 0) z += (prevR + ri) * 0.68;
                const g = new THREE.Group(); g.position.set(0, lift + ri, z); pivot.add(g);
                const hw = i === 0 ? seg(16, 8) : seg(11, 6), hh = i === 0 ? seg(12, 6) : seg(8, 5);
                const force = s.pattern === 'stripes' && i > 0 ? (i % 2 ? 2 : 0) : undefined;
                patterned(ellipsoidGeo(ri, ri * (i === 0 ? 1 : 0.92), ri, hw, hh, 0, 0, 0), g, [0, 0, 0], [ri, ri, ri], { belly: i === 0 ? 'front' : 'none', force: force, face: i === 0 });
                A.segs.push({ g: g, x: 0, y: lift + ri, r: ri });
                prevR = ri;
            }
            faceParent = A.segs[0].g;
            face = ellSurf([0, 0, 0], [r0, r0, r0]);
            trunk = ellSurf([0, lift + r0, z / 2], [r0, r0, z / 2 + r0]);
        } else if (B === 'jelly') {
            const r = [R.range(0.48, 0.55), R.range(0.42, 0.52), R.range(0.48, 0.55)], c = [0, lift, 0];
            spin.position.set(c[0], c[1], c[2]);
            const dws = seg(20, 8), dome = new THREE.SphereGeometry(1, dws, seg(9, 4), 0, Math.PI * 2, 0, Math.PI / 2);
            dome.userData.quads = [dws, 0, true];
            dome.scale(r[0], r[1], r[2]);
            patterned(dome, spin, [0, 0, 0], r, { belly: 'none', axis: 'y', face: true });
            const disc = keep(new THREE.CircleGeometry(1, seg(20, 8)));
            disc.rotateX(Math.PI / 2);
            mesh(disc, M.belly, spin, [0, 0, 0], [r[0], 1, r[2]]);
            const rim = keep(new THREE.TorusGeometry(1, 0.09, seg(5, 3), seg(20, 8)));
            rim.rotateX(Math.PI / 2);
            mesh(rim, M.accent, spin, [0, 0, 0], [r[0], r[0], r[2]]);
            trunk = face = ellSurf(c, r);
            eyeEl = 12; mouthMinEl = 8;
        } else if (B === 'cube') {
            const h = [R.range(0.38, 0.44), R.range(0.34, 0.4), R.range(0.34, 0.4)], c = [0, lift + h[1], 0];
            const rad = s.worldType === 'crystal' ? 0.05 : 0.15, n = seg(5, 2);
            const g = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2, n, n, n);
            const p = g.attributes.position, v = new V(), inner = new V();
            for (let i = 0; i < p.count; i++) {
                v.fromBufferAttribute(p, i);
                inner.set(U.clamp(v.x, -h[0] + rad, h[0] - rad), U.clamp(v.y, -h[1] + rad, h[1] - rad), U.clamp(v.z, -h[2] + rad, h[2] - rad));
                v.sub(inner); if (v.lengthSq() > 1e-12) v.setLength(rad);
                v.add(inner); p.setXYZ(i, v.x, v.y, v.z);
            }
            g.computeVertexNormals();
            g.translate(c[0], c[1], c[2]);
            patterned(g, pivot, c, h, { belly: 'front', axis: 'y', face: true, quads: 'box' });
            trunk = face = boxSurf(c, h);
            azScale = 0.55; eyeEl = -2;
        } else { // star
            const R1 = R.range(0.52, 0.58), R2 = R1 * R.range(0.48, 0.54), depth = 0.2, bevel = 0.07;
            const pts = [];
            for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R2 : R1; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
            const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const sh = new THREE.Shape();
            for (let k = 0; k < 10; k += 2) {
                const tip = pts[k], before = pts[(k + 9) % 10], after = pts[k + 1];
                const a = lerp2(before, tip, 0.7), b = lerp2(tip, after, 0.3);
                if (k === 0) sh.moveTo(a[0], a[1]); else sh.lineTo(a[0], a[1]);
                sh.quadraticCurveTo(tip[0], tip[1], b[0], b[1]);
                sh.lineTo(after[0], after[1]);
            }
            sh.closePath();
            const g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.06, bevelSegments: seg(2, 1), curveSegments: seg(4, 2) });
            const lowY = Math.sin(Math.PI / 2 + 4 * Math.PI / 5) * R1;      // the two feet points
            const c = [0, lift + -lowY * 0.92 + 0.04, 0];
            g.translate(0, c[1], -depth / 2);
            patterned(g, pivot, c, [R1, R1, depth / 2 + bevel], { belly: 'none', axis: 'y', face: true });
            trunk = face = boxSurf(c, [R2 * 0.8, R2 * 0.8, depth / 2 + bevel]);
            face.size = R2 * 1.1;
            face.top = new V(0, c[1] + R1 * 0.85, 0);
            azScale = 0.6; eyeEl = 4;
        }

        // Underside height at (x, z): where legs join the trunk.
        if (B === 'cube') hipY = () => trunk.c[1] - trunk.r[1] + 0.05;
        else if (B === 'star') hipY = () => trunk.c[1] - trunk.r[1] * 0.9;
        else hipY = function (x, z) {
            const c = trunk.c, r = trunk.r;
            const k = 1 - ((x - c[0]) / r[0]) ** 2 - ((z - c[2]) / r[2]) ** 2;
            return c[1] - r[1] * Math.sqrt(Math.max(0.12, k)) + 0.05;
        };

        // --- legs ---
        if (s.legs > 0 && s.legKind !== 'tentacle') {
            const stick = s.legKind === 'stick', wormy = B === 'worm';
            const lr = (stick ? 0.045 : 0.1) * (wormy ? 0.6 : 1), fr = (stick ? 0.085 : 0.12) * (wormy ? 0.6 : 1);
            const legGeo = cylG(seg(8, 5), true, 0.85), footGeo = sphereG(seg(8, 5), seg(6, 4));
            const spots = [];
            const tr = trunk.r, tc = trunk.c;
            if (wormy) {
                for (let i = 0; i < s.legs / 2; i++) {
                    const sg = A.segs[Math.min(A.segs.length - 1, i + 1)];
                    spots.push({ x: -sg.r * 0.55, z: 0, y: -sg.r * 0.55, parent: sg.g, side: -1, i: i });
                    spots.push({ x: sg.r * 0.55, z: 0, y: -sg.r * 0.55, parent: sg.g, side: 1, i: i });
                }
            } else if (s.legs === 2) {
                spots.push({ x: -0.45 * tr[0], z: 0, side: -1, i: 0 }, { x: 0.45 * tr[0], z: 0, side: 1, i: 1 });
            } else if (s.legs === 3) {
                spots.push({ x: -0.48 * tr[0], z: -0.3 * tr[2], side: -1, i: 0 }, { x: 0.48 * tr[0], z: -0.3 * tr[2], side: 1, i: 1 }, { x: 0, z: 0.5 * tr[2], side: 0, i: 2 });
            } else {
                const pairs = s.legs / 2;
                for (let i = 0; i < pairs; i++) {
                    const z = tc[2] + (pairs === 1 ? 0 : (-0.55 + 1.1 * i / (pairs - 1)) * tr[2]);
                    spots.push({ x: -0.55 * tr[0], z: z, side: -1, i: i * 2 }, { x: 0.55 * tr[0], z: z, side: 1, i: i * 2 + 1 });
                }
            }
            spots.forEach(function (sp, k) {
                const parent = sp.parent || pivot;
                const hy = sp.parent ? sp.y : hipY(sp.x, sp.z);
                const groundY = sp.parent ? -sp.parent.position.y : 0;
                const len = Math.max(0.04, hy - groundY - fr * 0.6);
                const p = new THREE.Group(); p.position.set(sp.x, hy, sp.z); parent.add(p);
                mesh(legGeo, M.main, p, null, [lr, len + 0.02, lr]);
                mesh(footGeo, stick ? M.accent : M.belly, p, [0, -len, -fr * 0.3], [fr, fr * 0.6, fr * 1.3]);
                // Neighbours step in turn; left and right opposite.
                const phase = s.legs <= 4 ? (k % 2) * Math.PI + (s.legs === 4 && k >= 2 ? Math.PI : 0) : sp.i * 0.9 + (sp.side > 0 ? Math.PI : 0);
                A.legs.push({ p: p, phase: phase, side: sp.side });
            });
        }

        // --- tentacles ---
        if (s.legs > 0 && s.legKind === 'tentacle') {
            const n = s.legs, segN = seg(4, 3), radial = seg(7, 4);
            const cg = cylG(radial, true, 0.8), tipG = sphereG(seg(7, 4), seg(5, 3));
            const ringR = 0.55 * Math.min(trunk.r[0], trunk.r[2]);
            const L = hanging ? tentLen : R.range(0.42, 0.5);
            const r0 = (B === 'jelly' ? 0.06 : 0.075) * (n > 6 ? 0.85 : 1);
            const off = R.range(0, Math.PI * 2);
            for (let i = 0; i < n; i++) {
                const a = off + i / n * Math.PI * 2;
                const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR;
                const by = B === 'jelly' ? lift : hipY(x, z) + 0.02;
                const axis = new V(-Math.sin(a), 0, Math.cos(a));
                const pivots = [];
                let p = new THREE.Group(); p.position.set(x, by, z); (B === 'jelly' ? pivot : pivot).add(p);
                const segL = L / segN;
                for (let j = 0; j < segN; j++) {
                    const rr = r0 * (1 - j / segN * 0.55);
                    mesh(cg, j % 2 && s.pattern === 'stripes' ? M.accent : M.main, p, null, [rr, segL * 1.04, rr]);
                    pivots.push(p);
                    const nx = new THREE.Group(); nx.position.y = -segL; p.add(nx); p = nx;
                }
                mesh(tipG, M.accent, p, null, r0 * 0.7);
                const base = hanging ? R.range(0.12, 0.3) : Math.acos(U.clamp(by / L * 1.15, 0, 0.95));
                A.tents.push({ pivots: pivots, axis: axis, base: base, curl: hanging ? 0.08 : -0.22, phase: i * 1.3 + R.range(0, 1) });
            }
        }

        // --- the face ---
        const fs = face.size;
        const er = fs * EYE_R[s.eyes - 1] * (s.eyeStalks ? 0.85 : 1);
        const eyeQ = q * (s.eyes <= 2 ? 1 : s.eyes <= 4 ? 0.75 : 0.58);
        const ew = Math.max(6, Math.round(14 * eyeQ)), eh = Math.max(4, Math.round(10 * eyeQ));
        const whiteG = sphereG(ew, eh);
        const pupilTheta = R.range(0.62, 0.8);
        const pupilG = cached('pupil', function () {
            const g = new THREE.SphereGeometry(1, ew, Math.max(2, Math.round(eh * 0.45)), 0, Math.PI * 2, 0, pupilTheta);
            g.rotateX(-Math.PI / 2); return g;
        });
        const shineG = sphereG(Math.max(5, Math.round(7 * eyeQ)), Math.max(3, Math.round(5 * eyeQ)));
        const shineDir = new V(0.34, 0.38, -0.86).normalize();
        const blinkEvery = R.range(2.6, 5.5);

        function makeEye(parent, pos, look, radius, i) {
            const g = new THREE.Group();
            g.position.copy(pos);
            g.quaternion.setFromUnitVectors(NEG_Z, look);
            mesh(whiteG, M.white, g, null, radius);
            mesh(pupilG, M.pupil, g, null, radius * 1.02);
            mesh(shineG, M.white, g, [shineDir.x * radius * 1.0, shineDir.y * radius * 1.0, shineDir.z * radius * 1.0], radius * 0.22);
            parent.add(g);
            A.eyes.push({ g: g, off: i * 0.06 });
            return g;
        }

        const layout = EYE_LAYOUT[s.eyes - 1];
        let minEl = 90, outerAz = 0;
        layout.forEach(function (e, i) {
            const az = e[0] * azScale, el = e[1] + eyeEl;
            if (s.eyeStalks) {
                const st = face.at(az * 1.1, Math.min(80, 58 + e[1] * 0.4 + eyeEl * 0.3));
                const sp = new THREE.Group(); sp.position.copy(st.p); faceParent.add(sp);
                const dir = st.n.clone().add(new V(0, 1.6, -0.25)).normalize();
                const len = fs * R.range(0.42, 0.6) + er;
                const stalk = mesh(cylG(seg(6, 4), false, 0.7), M.main, sp, null, [er * 0.28, len, er * 0.28]);
                stalk.quaternion.setFromUnitVectors(UP, dir);
                const look = new V(dir.x * 0.25, 0, -1).normalize();
                makeEye(sp, dir.clone().multiplyScalar(len + er * 0.6), look, er, i);
                A.stalks.push({ p: sp, phase: i * 1.7 });
            } else {
                const at = face.at(az, el);
                const look = at.n.clone().multiplyScalar(0.35).add(new V(0, 0, -1)).normalize();
                makeEye(faceParent, at.p.clone().addScaledVector(at.n, er * 0.32), look, er, i);
            }
            minEl = Math.min(minEl, el); outerAz = Math.max(outerAz, Math.abs(az));
        });
        if (s.eyeStalks) { minEl = 22 + eyeEl; outerAz = 20 * azScale; }

        // A smile (or a little round "oo" mouth). Never teeth.
        const mouthEl = Math.max(mouthMinEl, minEl - (s.eyeStalks ? 22 : 24) * (fs / 0.45) - EYE_R[s.eyes - 1] * 20);
        const mAt = face.at(0, mouthEl);
        const mq = new THREE.Quaternion().setFromUnitVectors(NEG_Z, mAt.n);
        if (R.chance(0.8)) {
            const smileG = cached('smile', function () {
                const g = new THREE.TorusGeometry(1, 0.22, seg(5, 3), seg(12, 6), Math.PI);
                g.rotateZ(Math.PI); return g;
            });
            const m = mesh(smileG, M.mouth, faceParent, null, fs * R.range(0.16, 0.24));
            m.position.copy(mAt.p).addScaledVector(mAt.n, 0.004);
            m.quaternion.copy(mq);
        } else {
            const m = mesh(sphereG(seg(8, 5), seg(6, 4)), M.mouth, faceParent, null, [fs * 0.08, fs * 0.1, fs * 0.04]);
            m.position.copy(mAt.p); m.quaternion.copy(mq);
        }
        if (R.chance(0.55) && !flat) {
            const cg = sphereG(seg(8, 5), seg(6, 4));
            [-1, 1].forEach(function (side) {
                const c = face.at(side * Math.min(60, outerAz + 12), mouthEl + 6);
                const m = mesh(cg, M.cheek, faceParent, null, [fs * 0.1, fs * 0.07, fs * 0.03]);
                m.position.copy(c.p); m.quaternion.setFromUnitVectors(NEG_Z, c.n);
            });
        }

        // --- antennae ---
        const AZ_ANT = [[], [0], [-24, 24], [-30, 0, 30]][s.antennae];
        AZ_ANT.forEach(function (az, i) {
            let base, dir;
            if (face.top) { base = face.top.clone(); dir = new V(az / 60, 1, 0).normalize(); }
            else {
                const at = face.at(az * azScale, 72);
                base = at.p; dir = at.n.clone().add(new V(0, 1.4, 0)).normalize();
            }
            const p = new THREE.Group(); p.position.copy(base); faceParent.add(p);
            const len = fs * R.range(0.55, 0.8);
            const st = mesh(cylG(seg(6, 4), false, 0.7), M.main, p, null, [0.02, len, 0.02]);
            st.quaternion.setFromUnitVectors(UP, dir);
            mesh(sphereG(seg(9, 6), seg(7, 4)), M.accent, p, [dir.x * len, dir.y * len, dir.z * len], fs * 0.11);
            A.ants.push({ p: p, phase: i * 2.1 });
        });

        // --- ears ---
        if (s.ears) {
            const bunny = R.chance(0.4);
            [-1, 1].forEach(function (side) {
                const at = face.at(side * (B === 'cube' ? 40 : 52), B === 'cube' ? 70 : 55);
                const p = new THREE.Group(); p.position.copy(at.p); faceParent.add(p);
                const dir = at.n.clone().add(new V(0, bunny ? 1.6 : 0.6, 0)).normalize();
                const holder = new THREE.Group(); holder.quaternion.setFromUnitVectors(UP, dir); p.add(holder);
                if (bunny) mesh(sphereG(seg(10, 6), seg(8, 5)), M.main, holder, [0, fs * 0.36, 0], [fs * 0.13, fs * 0.42, fs * 0.07]);
                else mesh(sphereG(seg(10, 6), seg(8, 5)), M.main, holder, [0, fs * 0.08, 0], [fs * 0.22, fs * 0.22, fs * 0.09]);
                A.ears.push({ p: p, side: side });
            });
        }

        // --- tail ---
        if (s.tail) {
            const at = trunk.at(180, B === 'flat' ? 0 : -8);
            const wag = new THREE.Group(); wag.position.copy(at.p); pivot.add(wag);
            const chain = new THREE.Group(); chain.quaternion.setFromUnitVectors(UP, new V(0, 0.55, 1).normalize()); wag.add(chain);
            const segs = [];
            let p = chain;
            const len = fs * R.range(0.28, 0.4), tr = fs * 0.075;
            for (let j = 0; j < 3; j++) {
                mesh(cylG(seg(6, 4), false, 0.8), M.main, p, null, [tr * (1 - j * 0.2), len * 1.05, tr * (1 - j * 0.2)]);
                const nx = new THREE.Group(); nx.position.y = len; nx.rotation.x = -0.35; p.add(nx); segs.push(nx); p = nx;
            }
            mesh(sphereG(seg(10, 6), seg(8, 5)), M.accent, p, null, fs * 0.16);
            A.tail = { wag: wag, segs: segs };
        }

        // --- wings ---
        if (s.wings) {
            const big = floaty ? 1.45 : 1;
            [-1, 1].forEach(function (side) {
                const at = trunk.at(side * 115, B === 'flat' ? 20 : 38);
                const p = new THREE.Group(); p.position.copy(at.p); pivot.add(p);
                const w = fs * 0.36 * big;
                mesh(sphereG(seg(10, 6), seg(6, 4)), M.belly, p, [side * w * 0.9, 0, 0.04], [w, fs * 0.035, w * 0.55]);
                A.wings.push({ p: p, side: side });
            });
        }

        // --- animation ---
        let hover = 0;
        const ph = (s.seed % 1000) / 1000 * Math.PI * 2;
        const rate = 1 / Math.sqrt(Math.max(0.35, s.size));     // big creatures move slower
        let mv = 0, hopP = 0, spinX = 0;
        const hopH = U.clamp(s.size * 0.35, 0.12, 1.2);

        function update(dt, t, moving) {
            dt = Math.min(Math.max(dt || 0, 0), 0.25);
            t = (t || 0) + ph;
            mv = U.approach(mv, moving ? 1 : 0, 6, dt);
            const w = rate * (2 + 4 * mv);
            let y = hover, sq = 1;
            pivot.rotation.set(0, (1 - mv) * 0.18 * Math.sin(t * 0.4), 0);
            spin.scale.set(1, 1, 1);

            switch (s.move) {
                case 'hop': {
                    if (moving || hopP > 0) {
                        hopP += dt * rate * 1.3;
                        if (hopP >= 1) hopP = moving ? hopP % 1 : 0;
                    }
                    if (hopP > 0 && hopP < 0.75) {
                        const a = hopP / 0.75;
                        y += hopH * Math.sin(Math.PI * a);
                        sq = 1 + 0.12 * Math.sin(Math.PI * a);
                    } else if (hopP >= 0.75) {
                        sq = 1 - 0.18 * Math.sin(Math.PI * (hopP - 0.75) / 0.25);
                    } else {
                        sq = 1 + 0.03 * Math.sin(t * 2.2);       // breathing
                    }
                    break;
                }
                case 'walk':
                    y += mv * 0.04 * s.size * Math.abs(Math.sin(t * w));
                    pivot.rotation.z = mv * 0.06 * Math.sin(t * w);
                    sq = 1 + 0.025 * Math.sin(t * 2);
                    break;
                case 'crawl':
                    y += mv * 0.02 * s.size * Math.abs(Math.sin(t * w * 1.5));
                    if (s.legs === 0) pivot.scale.z = 1 + 0.06 * Math.sin(t * w * 1.2);
                    sq = 1 + 0.025 * Math.sin(t * 1.8);
                    break;
                case 'roll':
                    spinX = (spinX - dt * mv * 3 * rate) % (Math.PI * 2);
                    spin.rotation.x = spinX + (1 - mv) * 0.12 * Math.sin(t * 1.5);
                    break;
                case 'slither':
                    sq = 1;
                    break;
                case 'float':
                    y += 0.08 * s.size * Math.sin(t * 0.9);
                    pivot.rotation.z = 0.06 * Math.sin(t * 0.6);
                    pivot.rotation.x = -mv * 0.12;
                    break;
                case 'drift':
                    y += 0.06 * s.size * Math.sin(t * 1.3);
                    pivot.rotation.z = 0.15 * Math.sin(t * 0.8);
                    pivot.rotation.x = -mv * 0.1;
                    break;
            }
            root.position.y = y;
            if (s.move !== 'crawl' || s.legs !== 0) pivot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            else { pivot.scale.x = 1; pivot.scale.y = sq; }

            if (B === 'jelly') {
                const pu = Math.sin(t * 2.2);
                spin.scale.set(1 - 0.06 * pu, 1 + 0.08 * pu, 1 - 0.06 * pu);
            }

            // Worm wiggle: a wave runs from head to tail.
            for (let i = 0; i < A.segs.length; i++) {
                const sg = A.segs[i];
                const amp = (s.move === 'slither' ? 0.22 : 0.05) * (0.25 + 0.75 * mv) * sg.r * 2 * (i === 0 ? 0.4 : 1);
                sg.g.position.x = amp * Math.sin(t * w * 0.9 - i * 0.9);
                sg.g.position.y = sg.y + (s.move === 'crawl' ? mv * sg.r * 0.25 * Math.max(0, Math.sin(t * w - i * 0.8)) : 0);
            }

            for (const L of A.legs) {
                const swing = s.move === 'hop' ? (hopP > 0 && hopP < 0.75 ? 0.35 : 0) : mv * (s.move === 'crawl' ? 0.45 : 0.55) * Math.sin(t * w + L.phase);
                L.p.rotation.set(swing, 0, L.side * 0.08);
            }
            for (const T of A.tents) {
                const sw = hanging ? 0.18 * Math.sin(t * (B === 'jelly' ? 2.2 : 1.4) - T.phase * 0.3) : mv * 0.3 * Math.sin(t * w + T.phase) + 0.05 * Math.sin(t * 1.3 + T.phase);
                for (let j = 0; j < T.pivots.length; j++) {
                    const a = j === 0 ? T.base + sw : T.curl + sw * 0.6 * Math.sin(t * 1.7 + j + T.phase);
                    T.pivots[j].quaternion.setFromAxisAngle(T.axis, a);
                }
            }
            for (const E of A.eyes) {
                const b = ((t + E.off) % blinkEvery + blinkEvery) % blinkEvery;
                E.g.scale.y = b > blinkEvery - 0.13 ? 0.12 : 1;
            }
            for (const S of A.stalks) S.p.rotation.set(0.08 * Math.sin(t * 2.1 + S.phase), 0, 0.12 * Math.sin(t * 1.7 + S.phase));
            for (const An of A.ants) An.p.rotation.set(0.1 * Math.sin(t * 2.3 + An.phase), 0, 0.14 * Math.sin(t * 3 + An.phase) + mv * 0.08 * Math.sin(t * 9 + An.phase));
            for (const Ea of A.ears) Ea.p.rotation.z = Ea.side * 0.08 * Math.sin(t * 2 + Ea.side) - (s.move === 'hop' && hopP > 0 ? Ea.side * 0.15 : 0);
            if (A.tail) {
                A.tail.wag.rotation.y = (0.25 + 0.35 * mv) * Math.sin(t * (3 + 5 * mv));
                for (let j = 0; j < A.tail.segs.length; j++) A.tail.segs[j].rotation.x = -0.35 - 0.1 * Math.sin(t * 2 + j);
            }
            for (const Wi of A.wings) {
                const f = floaty ? 0.25 + 0.45 * Math.sin(t * 9) : 0.2 + 0.25 * Math.max(0, Math.sin(t * 7)) * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
                Wi.p.rotation.z = Wi.side * f;
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
        hover = floaty ? (s.move === 'float' ? 0.5 + 0.35 * s.size : 0.3 + 0.2 * s.size) : 0;
        const height = nh * scale;
        const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 * scale;
        const fc = face.c;
        const fp = faceParent === pivot ? new V(fc[0], fc[1], fc[2]) : new V(fc[0], fc[1], fc[2]).add(faceParent.position);
        const focus = { x: (fp.x + rig.position.x) * scale, y: (fp.y + rig.position.y) * scale + hover, z: (fp.z + rig.position.z) * scale };

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
        FACTS: FACTS,
        TYPE_FACTS: TYPE_FACTS,
        GLOW_FACTS: GLOW_FACTS,
        SOUNDS: SOUNDS,
        spec: spec,
        words: words,
        build: build
    };
})();
