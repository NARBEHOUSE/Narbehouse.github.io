/**
 * NARBE Space Explorer - plants, as kinds of plant to find and identify (spec headless, build needs THREE).
 *
 *   spec(seed, world)          one plant species: its kind (tree, fern, kelp, glow cap...), colours,
 *                              size, where it grows and the words the scanner says. Same seed and
 *                              same world, the same plant, always. A world's first species is the
 *                              kind its words promise (NSE.Universe.plants: "palm trees on the
 *                              islands", "giant mushrooms"...), the others are all different kinds.
 *   draw(THREE, spec, x, y, z, yaw, size, emit, rnd)
 *                              one plant made of the shared shape templates, handed to emit(tpl,
 *                              matrixElements, colour0, colour1, glow). Fly Low merges thousands of
 *                              them into its ground chunks; build() uses the very same drawing.
 *                              Returns { top, r }: its height above y and its radius, in metres.
 *   build(THREE, spec, detail) a small standalone model for the scanner's viewer window (origin at
 *                              its base, facing -Z): { group, height, radius, update, dispose }.
 *   words(spec)                the scanner's lines, in order.
 *   KINDS                      [{ id, name, hint }] every kind, for the field guide.
 *   example(kindId)            a spec of that kind (a portrait, a silhouette).
 *
 * Built like the creatures (js/creatures.js): soft, friendly shapes, vertex colours from the
 * world's own palette, Lambert and Basic materials only, a few dozen triangles a plant.
 */

window.NSE = window.NSE || {};

NSE.Flora = (function () {
    'use strict';

    const U = NSE.Util;

    /**
     * Every kind: display name, the word in a species name, what it is, a hint where to find it,
     * size range (height in metres), where it grows, and how much of a chunk's plant budget one
     * plant takes (big plants count for more; tiny tufts for less).
     */
    const KINDS = [
        { id: 'tree', name: 'Leafy Tree', word: 'Tree', what: 'a leafy tree', hint: 'Grows in the forests of earth-like worlds', size: [4.5, 8], habitat: 'land', unit: 1 },
        { id: 'pine', name: 'Cone Tree', word: 'Pine', what: 'a cone-shaped tree', hint: 'Grows on the mountains of earth-like worlds', size: [6, 10], habitat: 'land', unit: 1 },
        { id: 'blossom', name: 'Blossom Tree', word: 'Blossom', what: 'a tree covered in blossoms', hint: 'Flowers in forests and meadows on earth-like worlds', size: [4, 6.5], habitat: 'land', unit: 1 },
        { id: 'jungle-tree', name: 'Giant Jungle Tree', word: 'Giant Tree', what: 'a giant jungle tree', hint: 'Towers over the jungles of earth-like worlds', size: [9, 14], habitat: 'land', unit: 1.3 },
        { id: 'palm', name: 'Palm Tree', word: 'Palm', what: 'a palm tree', hint: 'Grows on the islands of ocean worlds', size: [4.5, 7], habitat: 'shore', unit: 1 },
        { id: 'bush', name: 'Berry Bush', word: 'Berry Bush', what: 'a round berry bush', hint: 'Grows almost anywhere there are trees', size: [0.8, 1.6], habitat: 'land', unit: 0.8 },
        { id: 'flower', name: 'Flower Patch', word: 'Flower', what: 'a little flower', hint: 'Blooms in meadows and on islands', size: [0.3, 0.6], habitat: 'land', unit: 0.8 },
        { id: 'tallflower', name: 'Sunbloom', word: 'Sunbloom', what: 'a tall flower with a big face', hint: 'Stands tall in meadows and deserts after rain', size: [1.4, 2.6], habitat: 'land', unit: 0.8 },
        { id: 'fern', name: 'Fern', word: 'Fern', what: 'a leafy fern', hint: 'Loves the shady jungles and forests', size: [0.7, 1.5], habitat: 'land', unit: 0.7 },
        { id: 'grass', name: 'Tall Grass', word: 'Grass', what: 'a tuft of tall grass', hint: 'Waves in the meadows of earth-like worlds', size: [0.5, 1.1], habitat: 'land', unit: 0.5 },
        { id: 'reed', name: 'Reeds', word: 'Reed', what: 'a clump of reeds', hint: 'Grows at the edge of lakes and seas', size: [1.4, 2.4], habitat: 'wet', unit: 0.7 },
        { id: 'lily', name: 'Water Lily', word: 'Lily', what: 'a water lily', hint: 'Floats on calm lakes and lagoons', size: [0.2, 0.35], habitat: 'pond', unit: 0.6 },
        { id: 'kelp', name: 'Kelp', word: 'Kelp', what: 'a giant seaweed', hint: 'Its leaves float on the seas of ocean worlds', size: [3, 9], habitat: 'sea', unit: 0.8 },
        { id: 'coral', name: 'Coral', word: 'Coral', what: 'a branching coral', hint: 'Grows on the reefs of warm shallow seas', size: [0.8, 1.8], habitat: 'reef', unit: 0.8 },
        { id: 'cactus', name: 'Tall Cactus', word: 'Cactus', what: 'a tall cactus', hint: 'Stands in the deserts', size: [2.5, 6], habitat: 'land', unit: 1 },
        { id: 'barrel', name: 'Barrel Cactus', word: 'Barrel', what: 'a round barrel cactus', hint: 'Sits in the sand of desert worlds', size: [0.5, 1.2], habitat: 'land', unit: 0.7 },
        { id: 'succulent', name: 'Star Plant', word: 'Star Plant', what: 'a star-shaped succulent', hint: 'Grows in dry deserts', size: [0.3, 0.7], habitat: 'land', unit: 0.6 },
        { id: 'tumble', name: 'Puff Shrub', word: 'Puff Shrub', what: 'a fluffy round shrub', hint: 'Rolls about the deserts when it dries out', size: [0.6, 1.2], habitat: 'land', unit: 0.7 },
        { id: 'mushroom', name: 'Giant Mushroom', word: 'Giant Mushroom', what: 'a giant mushroom', hint: 'Towers over toxic worlds', size: [7, 15], habitat: 'land', unit: 2 },
        { id: 'puffball', name: 'Puffball', word: 'Puffball', what: 'a cluster of puffballs', hint: 'Huddles on the ground of toxic worlds', size: [0.5, 1.4], habitat: 'land', unit: 0.7 },
        { id: 'glowcap', name: 'Glow Cap', word: 'Glow Cap', what: 'a little glowing mushroom', hint: 'Glows in the swamps of toxic worlds', size: [0.3, 0.7], habitat: 'land', unit: 0.6 },
        { id: 'pitcher', name: 'Pitcher Plant', word: 'Pitcher', what: 'a pitcher plant shaped like a jug', hint: 'Grows on toxic worlds', size: [0.9, 1.8], habitat: 'land', unit: 0.8 },
        { id: 'bubblepod', name: 'Bubble Pod', word: 'Bubble Pod', what: 'a plant with glowing pods', hint: 'Lights up toxic worlds', size: [1, 2.2], habitat: 'land', unit: 0.8 },
        { id: 'crystal-tree', name: 'Crystal Tree', word: 'Crystal Tree', what: 'a tree made of crystal', hint: 'Grows in the crystal forests', size: [6, 9], habitat: 'land', unit: 1 },
        { id: 'crystal-flower', name: 'Crystal Flower', word: 'Crystal Flower', what: 'a flower made of crystal', hint: 'Shines on crystal worlds', size: [0.5, 1.1], habitat: 'land', unit: 0.7 },
        { id: 'crystal-fern', name: 'Glass Fern', word: 'Glass Fern', what: 'a fern as clear as glass', hint: 'Sparkles on crystal worlds', size: [0.8, 1.6], habitat: 'land', unit: 0.7 },
        { id: 'frost-fern', name: 'Frost Fern', word: 'Frost Fern', what: 'a frosty fern', hint: 'Grows on ice worlds', size: [0.6, 1.3], habitat: 'land', unit: 0.7 },
        { id: 'snow-moss', name: 'Snow Moss', word: 'Snow Moss', what: 'a soft snowy moss', hint: 'Grows in cushions on ice worlds', size: [0.3, 0.6], habitat: 'land', unit: 0.6 },
        { id: 'ice-bloom', name: 'Ice Bloom', word: 'Ice Bloom', what: 'a flower that looks like ice', hint: 'Blooms on the coldest ice worlds', size: [0.5, 1.1], habitat: 'land', unit: 0.6 },
        { id: 'fire-flower', name: 'Fire Flower', word: 'Fire Flower', what: 'a flower that glows like an ember', hint: 'Grows beside the lava on lava worlds', size: [0.5, 1.1], habitat: 'land', unit: 0.6 },
        { id: 'ember-palm', name: 'Ember Palm', word: 'Ember Palm', what: 'a palm with glowing leaf tips', hint: 'Grows on warm lava worlds', size: [3.5, 6], habitat: 'land', unit: 1 },
        { id: 'sky-plant', name: 'Sky Balloon', word: 'Sky Balloon', what: 'a plant that floats on balloons', hint: 'Floats over the clouds of gas giants', size: [3, 6], habitat: 'air', unit: 1 },
        { id: 'sky-kelp', name: 'Sky Kelp', word: 'Sky Kelp', what: 'a floating ribbon plant', hint: 'Drifts in the winds of gas giants', size: [6, 12], habitat: 'air', unit: 1 },
        { id: 'lichen', name: 'Lichen', word: 'Lichen', what: 'a flat colourful lichen', hint: 'Grows on bare rocky moons', size: [0.1, 0.2], habitat: 'land', unit: 0.4 },
        { id: 'cushion', name: 'Cushion Plant', word: 'Cushion', what: 'a round cushion plant', hint: 'Hugs the ground on rocky moons', size: [0.3, 0.6], habitat: 'land', unit: 0.6 }
    ];
    const K = {};
    KINDS.forEach(function (k) { K[k.id] = k; });

    /** What grows where, after a world's first (promised) kind. */
    function kindTable(w) {
        const st = w.terrain && w.terrain.style, sea = w.seaLevel >= 0;
        switch (w.type) {
            case 'earth': return [['tree', 3], ['pine', 2], ['blossom', 1.3], ['bush', 2.5], ['flower', 3], ['tallflower', 1.3], ['fern', st === 'jungle' ? 4 : 1.8], ['grass', 1.6],
                ['reed', sea ? 1.2 : 0], ['lily', sea ? (st === 'lakes' ? 2 : 0.8) : 0], ['kelp', sea ? 0.6 : 0], ['palm', st === 'jungle' ? 1.2 : 0]];
            case 'ocean': return [['kelp', 3], ['coral', st === 'reefs' ? 4 : 2], ['bush', 1.5], ['flower', 1.5], ['fern', 1], ['grass', 1.2], ['reed', 0.6], ['palm', 1], ['tree', 0.6], ['lily', 0.4]];
            case 'desert': return [['barrel', 3], ['succulent', 3], ['tumble', 1.8], ['cactus', 1.2], ['tallflower', 0.7]];
            case 'toxic': return [['puffball', 3], ['glowcap', 3], ['pitcher', 2.4], ['bubblepod', 2.2], ['mushroom', 1], ['reed', sea ? 0.6 : 0]];
            case 'crystal': return [['crystal-flower', 3], ['crystal-fern', 3], ['crystal-tree', st === 'forest' ? 1.5 : 0]];
            case 'ice': return [['snow-moss', 3], ['ice-bloom', 2.5], ['frost-fern', 1.5]];
            case 'lava': return [['ember-palm', 2], ['fire-flower', 1.5]];
            case 'gas': return [['sky-kelp', 2], ['sky-plant', 1.5]];
            case 'rock': return [['cushion', 2], ['lichen', 1.5]];
        }
        return [['bush', 2], ['flower', 2], ['fern', 1]];
    }

    /** The kinds a world's words promise, in order (its first species, then the next...). */
    function promised(w) {
        const st = w.terrain && w.terrain.style;
        switch (w.type) {
            case 'earth':
                if (st === 'jungle') return ['jungle-tree'];
                if (st === 'meadow') return ['grass', 'bush', 'tree'];
                return [st === 'mountains' ? 'pine' : 'tree', 'bush'];
            case 'ocean': return st === 'reefs' ? ['palm', 'coral', 'kelp'] : ['palm', 'kelp'];
            case 'desert': return ['cactus'];
            case 'toxic': return ['mushroom'];
            case 'crystal': return [st === 'forest' ? 'crystal-tree' : 'crystal-flower'];
            case 'ice': return ['frost-fern'];
            case 'lava': return ['fire-flower'];
            case 'gas': return ['sky-plant'];
            case 'rock': return ['lichen'];
        }
        return ['bush'];
    }

    /** The kind of each of a world's plant species, in order: the promised ones, then all different. */
    function kindsOf(w) {
        const list = (w.flora && w.flora.species) || [];
        const out = [], pr = promised(w);
        for (let i = 0; i < list.length; i++) {
            if (i < pr.length) { out.push(pr[i]); continue; }
            const r = U.rng(U.hash('plant-kind', list[i], w.type));
            let tbl = kindTable(w).filter(function (p) { return p[1] > 0 && out.indexOf(p[0]) < 0; });
            if (!tbl.length) tbl = kindTable(w).filter(function (p) { return p[1] > 0; });
            out.push(r.weighted(tbl));
        }
        return out;
    }

    // --- names and words ----------------------------------------------------------------------------

    const SYL1 = ['bel', 'lu', 'mi', 'flo', 'wil', 'pip', 'tan', 'sol', 'ri', 'nim', 'pe', 'ol', 'ver', 'am', 'ly', 'ka', 'su', 'dew', 'fen', 'mo',
        'el', 'iv', 'ro', 'sa', 'ti', 'wen', 'za', 'fae', 'bri', 'co', 'da', 'ho', 'ju', 'li', 'ma', 'no', 'pa', 'qui', 'ru', 'si', 'vi', 'yo'];
    const SYL2 = ['la', 'lo', 'ra', 'ri', 'na', 'ne', 'sa', 'ta', 'ka', 'mi', 'bel', 'dor', 'lin', 'mar', 'nel', 'sel', 'tin', 'vy', 'wyn', 'zo', 'bo', 'ly', 'rie', 'ssa', 'ndi', 'po'];
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function plantName(seed, kind) {
        const rude = NSE.Universe && NSE.Universe.rude ? NSE.Universe.rude : function () { return false; };
        for (let k = 0; k < 20; k++) {
            const r = U.rng(U.hash('plant-name', seed, k));
            let s = r.pick(SYL1) + r.pick(SYL2);
            if (r.chance(0.22)) s += r.pick(['a', 'o', 'y', 'i']);
            if (!rude(s)) return cap(s) + ' ' + K[kind].word;
        }
        return 'Bella ' + K[kind].word;
    }

    const FACTS = {
        tree: ['Birds love to nest in its branches.', 'Its leaves rustle softly in the wind.', 'It can live for hundreds of years.'],
        pine: ['It stays green all year round.', 'It smells fresh, like a winter forest.', 'Its cones fall with a soft little thud.'],
        blossom: ['Its blossoms fall like soft pink snow.', 'It smells sweet, like a spring morning.', 'Buzzing creatures visit it all day long.'],
        'jungle-tree': ['It is so tall its top pokes up out of the mist.', 'Vines hang from its branches like ropes.', 'Lots of creatures live way up in its branches.'],
        palm: ['Its big leaves sway in the sea breeze.', 'It grows round fruits full of sweet juice.', 'It leans toward the sea to catch the sun.'],
        bush: ['Its little berries are a favourite snack for creatures.', 'Small creatures hide inside it to nap.', 'It grows in round, bouncy clumps.'],
        flower: ['It opens its petals when the sun comes out.', 'It smells sweet, a little like honey.', 'Its petals close up at night, like sleepy eyes.'],
        tallflower: ['It turns its big face to follow the sun.', 'It grows taller than a person in one summer.', 'Its seeds are a treat for birds.'],
        fern: ['Its fronds uncurl slowly, like a party blower.', 'It loves shady, damp places.', 'It is one of the oldest kinds of plant.'],
        grass: ['It whispers when the wind blows through it.', 'Grazing creatures love to munch it.', 'It bends in the wind but never breaks.'],
        reed: ['It grows with its feet in the water.', 'The wind makes it hum like a flute.', 'Its fluffy tops are full of tiny seeds.'],
        lily: ['Its round leaves float on the water like plates.', 'Frogs love to sit on its pads.', 'Its flower opens in the morning and closes at night.'],
        kelp: ['It grows from the sea floor all the way up to the waves.', 'Little gas balloons keep its leaves floating.', 'Sea creatures hide in its swaying forests.'],
        coral: ['It is built by millions of tiny creatures.', 'Creatures of every colour live around it.', 'It grows slowly, a little bit every year.'],
        cactus: ['It stores water inside, so it never gets thirsty.', 'It can live for two hundred years.', 'Its arms grow very, very slowly.'],
        barrel: ['It is round and fat, full of stored water.', 'It wears a little crown of flowers on top.', 'It leans toward the sun.'],
        succulent: ['Its thick leaves keep water safe from the sun.', 'It grows in a perfect star shape.', 'A fallen leaf can grow into a whole new plant.'],
        tumble: ['When it dries out it rolls away in the wind.', 'It is light and fluffy, like a ball of string.', 'Its tiny flowers smell of warm sand.'],
        mushroom: ['It is as tall as a house!', 'Its cap keeps the ground underneath cool and shady.', 'It grows from a web of threads under the ground.'],
        puffball: ['When you poke it, it puffs out a little cloud.', 'It is soft and squishy, like a pillow.', 'It grows in friendly little huddles.'],
        glowcap: ['It glows softly in the dark, like a night light.', 'Its glow helps little creatures find their way home.', 'It glows brighter when it rains.'],
        pitcher: ['It is shaped like a jug and holds rainwater.', 'Tiny creatures take baths in its cups.', 'Its lid keeps the rain from overflowing.'],
        bubblepod: ['Its pods glow like little lanterns.', 'Its pods pop softly when they are ripe.', 'It sways like it is dancing.'],
        'crystal-tree': ['It grows crystals instead of leaves.', 'It chimes softly when the wind blows.', 'Light shines right through its branches.'],
        'crystal-flower': ['Its petals are made of shining crystal.', 'It glows softly in many colours.', 'It rings like a tiny bell when touched.'],
        'crystal-fern': ['Its fronds are as clear as glass.', 'It makes little rainbows in the sunshine.', 'It grows one new crystal frond every year.'],
        'frost-fern': ['It loves the cold and sparkles with frost.', 'Its fronds are covered in tiny ice crystals.', 'It stays green under the snow.'],
        'snow-moss': ['It is soft and springy, like a cushion.', 'It keeps warm under a blanket of snow.', 'Tiny flowers peek out of it when the sun shines.'],
        'ice-bloom': ['Its petals look like they are made of ice.', 'It glows a soft blue in the dark.', 'It blooms in the coldest weather.'],
        'fire-flower': ['It loves the heat and glows like a warm ember.', 'It grows right next to the rivers of lava.', 'Its petals are warm to the touch.'],
        'ember-palm': ['The tips of its leaves glow like embers.', 'It drinks heat from the warm ground.', 'It sways in the hot air.'],
        'sky-plant': ['It floats in the sky on balloons it grows itself.', 'It never touches the ground, ever.', 'It drifts wherever the wind takes it.'],
        'sky-kelp': ['Its long ribbons drift in the wind like streamers.', 'A big floaty bubble keeps it up in the sky.', 'Sky creatures love to play in its ribbons.'],
        lichen: ['It is two living things working together as friends.', 'It grows very slowly on rocks.', 'It can live where almost nothing else can.'],
        cushion: ['It grows in a tight round cushion to stay warm.', 'Tiny flowers cover it like sprinkles.', 'It hugs the ground to hide from the wind.']
    };
    /** What it is like up close (by the kind of world: crystal plants chime, lava plants are warm...). */
    const TOUCH = {
        soft: ['Its leaves feel soft and smooth.', 'It smells fresh and green.', 'It hums quietly when the wind blows.', 'It smells a bit like lemons.',
            'It smells a bit like cinnamon.', 'It feels fuzzy, like a peach.', 'It wiggles a little when you say hello.', 'It smells sweet, like candy floss.'],
        crystal: ['It sparkles when the light hits it.', 'It feels cool and smooth, like glass.', 'It chimes softly when the wind blows.', 'It makes tiny rainbows on the ground.'],
        ice: ['It feels cold and crunchy, like fresh snow.', 'It sparkles with frost.', 'It smells like a cold winter morning.'],
        lava: ['It feels warm, like a cosy blanket.', 'It glows a little brighter when you come close.', 'It smells a bit like toast.'],
        toxic: ['It feels squishy and a little bouncy.', 'It wobbles like jelly when you poke it.', 'It smells a bit like fizzy sweets.'],
        dry: ['It feels tough and leathery.', 'It smells like warm sand.', 'It feels cool and smooth in the hot sun.'],
        sky: ['It feels as light as a feather.', 'It bobs gently when the wind blows.', 'It smells like fresh rain.']
    };
    const TOUCH_BY_TYPE = { crystal: 'crystal', ice: 'ice', lava: 'lava', toxic: 'toxic', desert: 'dry', gas: 'sky', rock: 'dry' };
    const SIZE_WORDS = [[0.3, 'about as tall as a mug'], [0.75, 'about knee high'], [1.3, 'about as tall as a child'], [2.2, 'about as tall as a person'],
        [4, 'about as tall as a bus'], [7.5, 'about as tall as a house'], [Infinity, 'taller than a house']];
    function sizeWords(h) { for (const w of SIZE_WORDS) if (h < w[0]) return w[1]; return SIZE_WORDS[SIZE_WORDS.length - 1][1]; }

    // --- colour ----------------------------------------------------------------------------------------

    const hsl = (h, s, l) => U.toHex(U.hsl(h, U.clamp(s, 0, 1), U.clamp(l, 0, 1)));
    const BLOOMS = [[2, 0.8, 0.62], [28, 0.9, 0.6], [46, 0.92, 0.6], [320, 0.7, 0.66], [338, 0.75, 0.68], [275, 0.6, 0.66], [200, 0.7, 0.62], [0, 0, 0.95], [55, 0.9, 0.72], [170, 0.6, 0.6]];

    function colours(r, kind, w) {
        const pal = (w && w.palette) || { low: '#c8b47a', mid: '#4f8f3f', high: '#7a6a4a', peak: '#f2f2f2' };
        const type = (w && w.type) || 'earth';
        const g = U.toHsl(U.hex(pal.mid));
        let leafH = g[0] + r.range(-25, 25), leafS = U.clamp(g[1] * r.range(0.8, 1.2), 0.25, 0.7), leafL = r.range(0.26, 0.4);
        let stemH = r.range(18, 34), stemS = r.range(0.3, 0.45), stemL = r.range(0.22, 0.34);
        const b = r.pick(BLOOMS), b2 = r.pick(BLOOMS);
        let bloom = hsl(b[0] + r.range(-8, 8), b[1], b[2]), bloom2 = hsl(b2[0], b2[1] * 0.9, b2[2] * 0.85);
        switch (type) {
            case 'desert': leafH = r.range(95, 150); leafS = r.range(0.3, 0.5); leafL = r.range(0.3, 0.42); break;
            case 'toxic': leafH = r.pick([r.range(70, 110), r.range(280, 320), r.range(160, 185)]); leafS = r.range(0.45, 0.7); leafL = r.range(0.35, 0.5);
                bloom = hsl(r.pick([r.range(290, 330), r.range(60, 95), r.range(25, 45), r.range(170, 190)]), 0.8, 0.6); break;
            case 'crystal': { const p = U.toHsl(U.hex(pal.high)); leafH = p[0] + r.range(-30, 30); leafS = r.range(0.45, 0.75); leafL = r.range(0.55, 0.72); stemH = leafH + 20; stemS = 0.4; stemL = 0.5;
                bloom = hsl(leafH + r.sign() * r.range(60, 140), 0.8, 0.7); break; }
            case 'ice': leafH = r.range(165, 215); leafS = r.range(0.25, 0.5); leafL = r.range(0.62, 0.8); bloom = hsl(r.pick([r.range(180, 210), r.range(270, 300), r.range(320, 345)]), 0.6, 0.78); break;
            case 'lava': leafH = r.range(0, 25); leafS = r.range(0.15, 0.3); leafL = r.range(0.12, 0.2); stemH = 10; stemS = 0.15; stemL = 0.12;
                bloom = hsl(r.range(12, 48), 1, 0.58); bloom2 = hsl(r.range(40, 55), 1, 0.7); break;
            case 'gas': { const p = U.toHsl(U.hex(pal.peak)); leafH = p[0] + r.range(-60, 60); leafS = r.range(0.4, 0.65); leafL = r.range(0.5, 0.66); bloom = hsl(leafH + r.range(90, 180), 0.65, 0.68); break; }
            case 'rock': leafH = r.pick([r.range(20, 55), r.range(160, 195), r.range(80, 110)]); leafS = r.range(0.4, 0.65); leafL = r.range(0.4, 0.55); bloom = hsl(r.range(30, 60), 0.85, 0.62); break;
            case 'ocean': if (kind === 'coral') bloom = hsl(r.pick([r.range(340, 370), r.range(20, 40), r.range(270, 310), r.range(170, 190)]) % 360, 0.75, 0.62); break;
        }
        if (kind === 'blossom') bloom = hsl(r.pick([r.range(320, 345), r.range(0, 10), r.range(280, 300)]) % 360, r.range(0.5, 0.75), r.range(0.78, 0.86));
        if (kind === 'kelp') { leafH = r.range(40, 95); leafS = r.range(0.4, 0.6); leafL = r.range(0.3, 0.42); }
        return {
            stem: hsl(stemH, stemS, stemL), stem2: hsl(stemH, stemS * 0.9, stemL * 1.3),
            leaf: hsl(leafH, leafS, leafL), leafD: hsl(leafH + r.range(-8, 8), leafS * 1.05, leafL * 0.68), leaf2: hsl(leafH + r.range(10, 30), leafS * 0.9, Math.min(0.88, leafL * 1.35)),
            bloom: bloom, bloom2: bloom2
        };
    }

    const GLOWY = { glowcap: 1, bubblepod: 1, 'crystal-flower': 1, 'crystal-fern': 1, 'crystal-tree': 1, 'ice-bloom': 1, 'fire-flower': 1, 'ember-palm': 1, mushroom: 1 };

    // --- the spec -------------------------------------------------------------------------------------

    /** One plant species. Deterministic: the same seed on the same world is always the same plant. */
    function spec(seed, world, forceKind) {
        seed = seed >>> 0;
        const w = world || { type: 'earth', terrain: { style: 'forest' } };
        let kind = forceKind && K[forceKind] ? forceKind : null;
        if (!kind && w.flora && w.flora.species) {
            const i = w.flora.species.indexOf(seed);
            if (i >= 0) kind = kindsOf(w)[i];
        }
        if (!kind) {
            const r0 = U.rng(U.hash('plant-kind', seed, w.type));
            kind = r0.weighted(kindTable(w).filter(p => p[1] > 0).concat([[promised(w)[0], 2]]));
        }
        const k = K[kind];
        const r = U.rng(U.hash('plant', seed, kind, w.type || 'earth'));
        const size = Math.round(r.range(k.size[0], k.size[1]) * 100) / 100;
        const s = {
            seed: seed,
            name: plantName(seed, kind),
            kind: kind,
            kindName: k.name,
            worldType: w.type || 'earth',
            habitat: k.habitat,
            size: size,
            sizeWords: sizeWords(size),
            colors: colours(r, kind, w),
            glow: !!GLOWY[kind],
            form: r.int(0, 2),
            lean: r.range(-0.18, 0.18),
            abundance: Math.round(r.range(0.6, 1.4) * 100) / 100,
            fact: r.pick(FACTS[kind] || FACTS.bush),
            touch: r.pick(TOUCH[TOUCH_BY_TYPE[w.type]] || TOUCH.soft)
        };
        return s;
    }

    function words(s) {
        const k = K[s.kind] || K.bush;
        const an = /^[AEIOU]/.test(s.name) ? 'an ' : 'a ';
        return ['This is ' + an + s.name + '.', 'It is ' + k.what + ', ' + s.sizeWords + '.', s.fact, s.touch];
    }

    // --- drawing ---------------------------------------------------------------------------------------

    function toLin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    function lin(hex) { const c = U.hex(hex); return [toLin(c[0]), toLin(c[1]), toLin(c[2])]; }
    const colCache = new WeakMap();
    function colsOf(sp) {
        let c = colCache.get(sp);
        if (c) return c;
        const C = sp.colors;
        c = {};
        Object.keys(C).forEach(function (key) { c[key] = lin(C[key]); });
        c.white = [0.9, 0.9, 0.86];
        c.dark = [c.stem[0] * 0.5, c.stem[1] * 0.5, c.stem[2] * 0.5];
        c.bloomD = [c.bloom[0] * 0.6, c.bloom[1] * 0.6, c.bloom[2] * 0.6];
        colCache.set(sp, c);
        return c;
    }
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    let CTX = null, CTX3 = null;
    function ctxFor(THREE) {
        if (CTX3 !== THREE) {
            CTX3 = THREE;
            CTX = { base: new THREE.Matrix4(), part: new THREE.Matrix4(), out: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() };
        }
        return CTX;
    }

    /**
     * The drawings. P(tpl, x, y, z, sx, sy, sz, rx, ry, rz, c0, c1, glow) places one template in the
     * plant's own space (y up from its base, metres). H = the plant's height. Each returns { top, r }.
     */
    const TAU = Math.PI * 2;
    /** A leaf / frond / petal along +x from (x,y,z), pointing at angle a round the stem, tipped up by rise. */
    function frond(P, x, y, z, a, rise, len, wid, c0, c1, glow) {
        const cx = x + Math.cos(a) * Math.cos(rise) * len * 0.5, cy = y + Math.sin(rise) * len * 0.5, cz = z + Math.sin(a) * Math.cos(rise) * len * 0.5;
        P('octa', cx, cy, cz, len * 0.5, Math.max(0.02, wid * 0.18), wid, 0, -a, rise, c0, c1, glow);
    }
    function petals(P, x, y, z, r0, tilt, c0, c1, glow, ry) {
        P('octa', x, y, z, r0, r0 * 0.22, r0, tilt || 0, ry || 0, 0, c0, c1, glow);
        P('octa', x, y + r0 * 0.02, z, r0 * 0.92, r0 * 0.22, r0 * 0.92, tilt || 0, (ry || 0) + Math.PI / 4, 0, c0, c1, glow);
    }

    const DRAW = {
        tree(P, sp, H, C, r) {
            const tr = H * (0.045 + sp.form * 0.008);
            P('cyl5', 0, -0.3, 0, tr, H * 0.55 + 0.3, tr, sp.lean * 0.3, r() * TAU, 0, C.stem, C.stem2);
            const cy = H * 0.64, cr = H * 0.3;
            if (sp.form === 0) {
                P('ico0', 0, cy + cr * 0.1, 0, cr, cr * 0.95, cr, 0, r() * TAU, 0, C.leafD, C.leaf2);
            } else if (sp.form === 1) {
                for (let k = 0; k < 2; k++) {
                    const a = k * 3.14 + r() * 0.5;
                    P('ico0', Math.cos(a) * cr * 0.4, cy - cr * 0.05 + k * cr * 0.3, Math.sin(a) * cr * 0.4, cr * 0.75, cr * 0.65, cr * 0.75, 0, r() * TAU, 0, C.leafD, k ? C.leaf2 : C.leaf);
                }
            } else {
                P('ico0', 0, cy + cr * 0.15, 0, cr * 0.72, cr * 1.15, cr * 0.72, 0, r() * TAU, 0, C.leafD, C.leaf2);
            }
            // Fruit or flowers dotted round the crown.
            for (let k = 0; k < 2; k++) {
                const a = k * 3.14 + r() * 0.8, e = r.range(-0.2, 0.6);
                P('octa', Math.cos(a) * cr * 0.85 * Math.cos(e), cy + Math.sin(e) * cr * 0.7, Math.sin(a) * cr * 0.85 * Math.cos(e), cr * 0.09, cr * 0.09, cr * 0.09, 0, a, 0, C.bloom, C.bloom);
            }
            return { top: cy + cr * (sp.form === 2 ? 1.25 : 0.95), r: cr };
        },
        pine(P, sp, H, C, r) {
            P('cyl5', 0, -0.3, 0, H * 0.04, H * 0.3, H * 0.04, 0, r() * TAU, 0, C.stem, C.stem2);
            const n = 2 + sp.form;
            for (let t = 0; t < n; t++) {
                const y = H * (0.16 + t * (0.6 / n)), rad = H * (0.24 - t * 0.12 / n), h = H * (0.84 - y / H * 0.6);
                P('cone6', 0, y, 0, rad, Math.min(h, H - y), rad, 0, r() * TAU, 0, C.leafD, t === n - 1 ? C.leaf2 : C.leaf);
            }
            return { top: H, r: H * 0.24 };
        },
        blossom(P, sp, H, C, r) {
            P('cyl5', 0, -0.3, 0, H * 0.05, H * 0.5 + 0.3, H * 0.05, 0, r() * TAU, 0, C.dark, C.stem);
            const cy = H * 0.66, cr = H * 0.32;
            for (let k = 0; k < 3; k++) {
                const a = k * 2.09 + r() * 0.6;
                const rr = k === 2 ? 0 : cr * 0.42;
                P('ico0', Math.cos(a) * rr, cy + (k === 2 ? cr * 0.35 : 0), Math.sin(a) * rr, cr * 0.66, cr * 0.55, cr * 0.66, 0, r() * TAU, 0, mixc(C.bloom, C.leaf, 0.25), C.bloom);
            }
            return { top: cy + cr * 0.9, r: cr };
        },
        'jungle-tree'(P, sp, H, C, r) {
            P('cyl5', 0, -0.3, 0, H * 0.045, H * 0.8 + 0.3, H * 0.045, 0, r() * TAU, 0, C.stem, C.stem2);
            const cy = H * 0.84, cr = H * 0.32;
            P('ico0', 0, cy, 0, cr, cr * 0.32, cr, 0, r() * TAU, 0, C.leafD, C.leaf);
            P('ico0', cr * 0.3, cy + cr * 0.22, cr * 0.2, cr * 0.62, cr * 0.25, cr * 0.62, 0, r() * TAU, 0, C.leaf, C.leaf2);
            for (let k = 0; k < 3; k++) {
                const a = k * 2.09 + r(), L = H * r.range(0.22, 0.38);
                P('cyl5', Math.cos(a) * cr * 0.7, cy - L, Math.sin(a) * cr * 0.7, H * 0.012, L, H * 0.012, 0, 0, 0, C.leafD, C.leaf);
            }
            return { top: cy + cr * 0.4, r: cr };
        },
        palm(P, sp, H, C, r) {
            const lean = 0.12 + Math.abs(sp.lean) * 1.2, len = H * 0.92, a0 = r() * TAU;
            const lx = Math.cos(a0), lz = Math.sin(a0);
            P('cyl5', 0, -0.3, 0, H * 0.035, len, H * 0.035, lz * lean, 0, -lx * lean, C.stem, C.stem2);
            const tx = lx * Math.sin(lean) * len, ty = -0.3 + Math.cos(lean) * len, tz = lz * Math.sin(lean) * len;
            const n = 6 + sp.form;
            for (let k = 0; k < n; k++) frond(P, tx, ty, tz, k / n * TAU + r() * 0.3, -r.range(0.25, 0.6), H * 0.5, H * 0.09, C.leafD, C.leaf);
            for (let k = 0; k < 3; k++) { const a = k * 2.09; P('octa', tx + Math.cos(a) * H * 0.04, ty - H * 0.05, tz + Math.sin(a) * H * 0.04, H * 0.04, H * 0.04, H * 0.04, 0, 0, 0, C.stem, C.bloom); }
            return { top: ty + H * 0.06, r: H * 0.45 };
        },
        bush(P, sp, H, C, r) {
            const R = H * 0.55;
            P('ico0', 0, H * 0.42, 0, R, H * 0.55, R, 0, r() * TAU, 0, C.leafD, C.leaf);
            P('ico0', R * 0.5, H * 0.3, R * 0.3, R * 0.6, H * 0.36, R * 0.6, 0, r() * TAU, 0, C.leafD, C.leaf2);
            for (let k = 0; k < 3; k++) { const a = k * 2.09 + r(); P('octa', Math.cos(a) * R * 0.85, H * r.range(0.35, 0.7), Math.sin(a) * R * 0.85, H * 0.09, H * 0.09, H * 0.09, 0, a, 0, C.bloom, C.bloom); }
            return { top: H, r: R };
        },
        flower(P, sp, H, C, r) {
            const m = 3 + sp.form;
            for (let k = 0; k < m; k++) {
                const a = r() * TAU, d = k ? r.range(0.3, 0.9) : 0, x = Math.cos(a) * d, z = Math.sin(a) * d, h = H * r.range(0.75, 1.1);
                P('octa', x, 0.05, z, 0.16, 0.05, 0.16, 0, r() * TAU, 0, C.leafD, C.leaf);
                P('cyl5', x, 0, z, 0.012, h, 0.012, 0, 0, 0, C.leafD, C.leaf);
                petals(P, x, h, z, H * 0.3, r.range(-0.3, 0.3), C.bloom2, C.bloom, false, r() * TAU);
            }
            return { top: H * 1.1, r: 1 };
        },
        tallflower(P, sp, H, C, r) {
            P('cyl5', 0, 0, 0, H * 0.018, H * 0.92, H * 0.018, sp.lean * 0.5, 0, 0, C.leafD, C.leaf);
            frond(P, 0, H * 0.35, 0, r() * TAU, 0.35, H * 0.28, H * 0.09, C.leafD, C.leaf);
            frond(P, 0, H * 0.5, 0, r() * TAU, 0.45, H * 0.24, H * 0.08, C.leafD, C.leaf);
            const hy = H * 0.92, hr = H * 0.17;
            petals(P, 0, hy, -hr * 0.2, hr, -0.5, C.bloom, C.bloom, false, r());
            P('ico0', 0, hy + hr * 0.08, -hr * 0.28, hr * 0.42, hr * 0.2, hr * 0.42, -0.5, 0, 0, C.bloom2, mixc(C.bloom2, C.dark, 0.5));
            return { top: hy + hr, r: hr };
        },
        fern(P, sp, H, C, r) {
            const n = 6 + sp.form;
            for (let k = 0; k < n; k++) frond(P, 0, 0.05, 0, k / n * TAU + r() * 0.4, r.range(0.55, 0.9), H * 1.15, H * 0.16, C.leafD, C.leaf2);
            return { top: H, r: H * 0.7 };
        },
        grass(P, sp, H, C, r) {
            const n = 5 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = r.range(0, 0.18), t = r.range(0.1, 0.35);
                P('cone6', Math.cos(a) * d, -0.05, Math.sin(a) * d, H * 0.05, H * r.range(0.8, 1.05), H * 0.05, Math.sin(a) * t, 0, -Math.cos(a) * t, C.leafD, C.leaf2);
            }
            return { top: H, r: 0.3 };
        },
        reed(P, sp, H, C, r) {
            const n = 5 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = r.range(0, 0.35), t = r.range(0, 0.12), h = H * r.range(0.8, 1);
                const x = Math.cos(a) * d, z = Math.sin(a) * d;
                P('cyl5', x, -0.2, z, 0.022, h, 0.022, Math.sin(a) * t, 0, -Math.cos(a) * t, C.leafD, C.leaf);
                if (k % 2 === 0) P('cyl5', x + Math.cos(a) * t * h * 0.8, h * 0.72, z + Math.sin(a) * t * h * 0.8, 0.055, h * 0.18, 0.055, Math.sin(a) * t, 0, -Math.cos(a) * t, C.stem, C.stem2);
            }
            return { top: H, r: 0.4 };
        },
        lily(P, sp, H, C, r) {
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.5, 1.1) : 0, s = r.range(0.35, 0.55);
                P('ico0', Math.cos(a) * d, 0, Math.sin(a) * d, s, 0.03, s, 0, r() * TAU, 0, C.leafD, C.leaf);
            }
            petals(P, 0, H * 0.5, 0, H * 0.55, 0, C.bloom, C.white, false, r());
            P('octa', 0, H * 0.62, 0, H * 0.16, H * 0.12, H * 0.16, 0, 0, 0, C.bloom2, C.bloom2);
            return { top: H, r: 1 };
        },
        kelp(P, sp, H, C, r) {
            // A little kelp forest from one holdfast (it was a single bare stalk): a few gently leaning
            // stalks with long ribbon blades all the way up, each second blade with a small gas float,
            // and a crown of blades lying on the waves at the top. In Fly Low (not FULL) only two stalks
            // with a couple of blades: most of it is under the water there, and every chunk's plant
            // triangles are limited.
            const n = FULL ? 3 + (sp.form > 0 ? 1 : 0) + (sp.form > 1 ? 1 : 0) : 2;
            if (FULL) P('ico0', 0, 0.04, 0, 0.3, 0.14, 0.3, 0, r() * TAU, 0, C.stem, C.leafD);
            for (let j = 0; j < n; j++) {
                const a = j / n * TAU + r() * 0.6, lean = r.range(0.06, 0.16) + Math.abs(sp.lean) * 0.25, h = H * r.range(0.82, 1.02);
                const dx = Math.cos(a) * Math.sin(lean), dz = Math.sin(a) * Math.sin(lean), up = Math.cos(lean);
                P('cyl5', 0, 0, 0, 0.065, h, 0.065, Math.sin(a) * lean, 0, -Math.cos(a) * lean, C.leafD, C.leaf);
                const blades = FULL ? Math.max(3, Math.min(7, Math.round(h / 0.8))) : 2;
                for (let k = 1; k <= blades; k++) {
                    const t = k / (blades + 1), x = dx * h * t, y = up * h * t, z = dz * h * t;
                    const ba = a + (k % 2 ? 1.25 : -1.25) + r.range(-0.3, 0.3);
                    frond(P, x, y, z, ba, r.range(0.55, 0.95), r.range(0.75, 1.1) * (0.75 + 0.45 * (1 - t)), 0.22, C.leafD, k % 3 ? C.leaf : C.leaf2);
                    if (FULL && k % 2 === 0) P('octa', x + Math.cos(ba) * 0.13, y + 0.04, z + Math.sin(ba) * 0.13, 0.075, 0.075, 0.075, 0, 0, 0, C.stem2, C.bloom);
                }
                const tx = dx * h, ty = up * h, tz = dz * h;
                for (let k = 0; k < 3; k++) frond(P, tx, ty, tz, a + (k - 1) * 0.9 + r() * 0.3, 0.04, r.range(1.0, 1.5), 0.3, C.leaf, C.leaf2);
                P('octa', tx, ty + 0.05, tz, 0.13, 0.11, 0.13, 0, 0, 0, C.stem2, C.bloom);
            }
            return { top: H + 0.15, r: 1.7 };
        },
        coral(P, sp, H, C, r) {
            const n = 4 + sp.form;
            P('ico0', 0, 0.1, 0, H * 0.3, H * 0.2, H * 0.3, 0, 0, 0, C.bloomD, C.bloom);
            for (let k = 0; k < n; k++) {
                const a = k / n * TAU + r() * 0.5, t = r.range(0.2, 0.55), h = H * r.range(0.75, 1);
                P('cyl5', 0, 0, 0, H * 0.06, h / Math.cos(t), H * 0.06, Math.sin(a) * t, 0, -Math.cos(a) * t, C.bloomD, C.bloom);
                P('octa', Math.cos(a) * Math.tan(t) * h, h, Math.sin(a) * Math.tan(t) * h, H * 0.12, H * 0.12, H * 0.12, 0, 0, 0, C.bloom, C.bloom2);
            }
            return { top: H, r: H * 0.6 };
        },
        cactus(P, sp, H, C, r) {
            const rad = H * 0.09;
            P('cyl5', 0, -0.3, 0, rad, H + 0.3, rad, 0, r() * TAU, 0, C.leafD, C.leaf);
            P('cap', 0, H - 0.05, 0, rad, rad, rad, 0, 0, 0, C.leaf, C.leaf);
            const arms = 1 + (sp.form > 0 ? 1 : 0) + (sp.form > 1 && r() < 0.5 ? 1 : 0);
            for (let j = 0; j < arms; j++) {
                const a = j * 2.4 + r() * 0.6, ax = Math.cos(a) * rad * 2.4, az = Math.sin(a) * rad * 2.4, ay = H * r.range(0.35, 0.58), al = H * r.range(0.25, 0.4);
                P('cyl5', ax, ay, az, rad * 0.7, al, rad * 0.7, 0, 0, 0, C.leafD, C.leaf);
                P('cap', ax, ay + al - 0.04, az, rad * 0.7, rad * 0.7, rad * 0.7, 0, 0, 0, C.leaf, C.leaf);
                P('box', ax / 2, ay, az / 2, rad * 2.4, rad * 1.1, rad * 1.1, 0, -a, 0, C.leafD, C.leaf);
            }
            if (sp.form === 2) petals(P, 0, H + rad * 0.6, 0, rad * 0.9, 0, C.bloom, C.bloom, false, r());
            return { top: H + rad * 0.5, r: rad * 3 };
        },
        barrel(P, sp, H, C, r) {
            P('hemi', 0, -0.02, 0, H * 0.48, H * 0.9, H * 0.48, 0, r() * TAU, 0, C.leafD, C.leaf);
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) { const a = k / n * TAU; petals(P, Math.cos(a) * H * 0.12, H * 0.86, Math.sin(a) * H * 0.12, H * 0.11, 0, C.bloom, C.bloom2, false, a); }
            return { top: H, r: H * 0.5 };
        },
        succulent(P, sp, H, C, r) {
            const n0 = 6 + sp.form;
            for (let ring = 0; ring < 2; ring++) {
                const n = ring ? 4 : n0;
                for (let k = 0; k < n; k++) {
                    const a = k / n * TAU + ring * 0.4 + r() * 0.1, rise = ring ? 1.0 : 0.45, L = H * (ring ? 0.75 : 1.15);
                    P('cone6', 0, 0, 0, H * 0.13, L, H * 0.13, 0, -a, -(Math.PI / 2 - rise), C.leafD, mixc(C.leaf, C.bloom, 0.55));
                }
            }
            return { top: H, r: H * 1.1 };
        },
        tumble(P, sp, H, C, r) {
            P('ico0', 0, H * 0.45, 0, H * 0.52, H * 0.46, H * 0.52, r(), r() * TAU, r(), mixc(C.stem, C.leaf, 0.4), C.leaf2);
            for (let k = 0; k < 4; k++) { const a = k * 1.57 + r(); P('octa', Math.cos(a) * H * 0.45, H * r.range(0.4, 0.8), Math.sin(a) * H * 0.45, H * 0.06, H * 0.06, H * 0.06, 0, 0, 0, C.bloom, C.bloom); }
            return { top: H * 0.92, r: H * 0.52 };
        },
        mushroom(P, sp, H, C, r) {
            const cap = H * 0.36, stemH = H - cap * 0.5, lean = sp.lean * 0.6;
            const stemC = mixc(C.white, C.leaf2, 0.3);
            P('cyl5', 0, -0.5, 0, H * 0.04 + cap * 0.08, stemH + 0.5, H * 0.04 + cap * 0.08, lean, 0, 0, mixc(stemC, C.dark, 0.2), stemC);
            const ty = -0.5 + Math.cos(lean) * (stemH + 0.5) - 0.2, tz = Math.sin(lean) * (stemH + 0.5);
            P('hemi', 0, ty, tz, cap, cap * 0.55, cap, 0, r() * TAU, 0, C.bloomD, C.bloom);
            const spots = 3 + sp.form;
            for (let j = 0; j < spots; j++) {
                const a = r() * TAU, rr = r.range(0.2, 0.7) * cap, yy = ty + cap * 0.55 * Math.sqrt(Math.max(0, 1 - (rr / cap) * (rr / cap))) - 0.1;
                P('octa', Math.cos(a) * rr, yy, tz + Math.sin(a) * rr, cap * 0.12, cap * 0.06, cap * 0.12, 0, a, 0, C.bloom2, C.white, true);
            }
            return { top: ty + cap * 0.55, r: cap };
        },
        puffball(P, sp, H, C, r) {
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.25, 0.6) * H : 0, s = H * (k ? r.range(0.22, 0.35) : 0.42);
                P('ico0', Math.cos(a) * d, s * 0.9, Math.sin(a) * d, s, s * 0.92, s, 0, r() * TAU, 0, mixc(C.bloom, C.white, 0.2), mixc(C.bloom, C.white, 0.55));
                P('octa', Math.cos(a) * d, s * 1.75, Math.sin(a) * d, s * 0.16, s * 0.08, s * 0.16, 0, 0, 0, C.bloom2, C.bloom2);
            }
            return { top: H, r: H * 0.7 };
        },
        glowcap(P, sp, H, C, r) {
            const n = 4 + sp.form * 2;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.15, 0.6) : 0, h = H * r.range(0.55, 1);
                P('cyl5', Math.cos(a) * d, -0.05, Math.sin(a) * d, h * 0.07, h, h * 0.07, 0, 0, 0, C.leaf2, C.white);
                P('cap', Math.cos(a) * d, h * 0.92, Math.sin(a) * d, h * 0.32, h * 0.2, h * 0.32, 0, 0, 0, C.bloom, mixc(C.bloom, C.white, 0.4), true);
            }
            return { top: H * 1.1, r: 0.7 };
        },
        pitcher(P, sp, H, C, r) {
            const n = 2 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = k / n * TAU + r() * 0.6, d = k ? H * 0.22 : 0, t = k ? 0.25 : 0.05, h = H * (k ? r.range(0.65, 0.9) : 1);
                const x = Math.cos(a) * d, z = Math.sin(a) * d;
                P('cyl8', x, 0, z, H * 0.12, h, H * 0.12, Math.sin(a) * t, 0, -Math.cos(a) * t, C.leafD, mixc(C.leaf, C.bloom, 0.7));
                const top = { x: x + Math.cos(a) * Math.sin(t) * h, y: Math.cos(t) * h, z: z + Math.sin(a) * Math.sin(t) * h };
                P('octa', top.x, top.y + H * 0.06, top.z, H * 0.15, H * 0.025, H * 0.18, 0.5, a, 0, C.bloom, C.bloom);
            }
            frond(P, 0, 0.05, 0, r() * TAU, 0.2, H * 0.5, H * 0.12, C.leafD, C.leaf);
            return { top: H * 1.06, r: H * 0.35 };
        },
        bubblepod(P, sp, H, C, r) {
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, t = r.range(0.1, 0.45), h = H * r.range(0.6, 0.9);
                P('cyl5', 0, -0.05, 0, H * 0.02, h, H * 0.02, Math.sin(a) * t, 0, -Math.cos(a) * t, C.leafD, C.leaf);
                const x = Math.cos(a) * Math.sin(t) * h, y = Math.cos(t) * h, z = Math.sin(a) * Math.sin(t) * h;
                P('ico0', x, y, z, H * 0.12, H * 0.13, H * 0.12, 0, 0, 0, C.bloom, mixc(C.bloom, C.white, 0.5), true);
            }
            return { top: H, r: H * 0.45 };
        },
        'crystal-tree'(P, sp, H, C, r) {
            const trunk = H * 0.55;
            P('cyl5', 0, -0.2, 0, H * 0.04, trunk, H * 0.04, 0, r() * TAU, 0, C.stem, C.leaf);
            const m = 4 + sp.form;
            for (let j = 0; j < m; j++) {
                const a = j / m * TAU + r() * 0.5, g = r() < 0.6;
                P('octa', Math.cos(a) * 0.06 * H, trunk - 0.6, Math.sin(a) * 0.06 * H, H * 0.1, H * 0.3, H * 0.1, Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75,
                    g ? C.leaf : mixc(C.leaf, C.stem, 0.3), g ? mixc(C.bloom, C.white, 0.3) : C.leaf2, g);
            }
            P('octa', 0, trunk - 0.4, 0, H * 0.1, H * 0.42, H * 0.1, 0, 0, 0, C.leaf, mixc(C.bloom, C.white, 0.35), true);
            return { top: trunk + H * 0.42, r: H * 0.35 };
        },
        'crystal-flower'(P, sp, H, C, r) {
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.2, 0.55) : 0, h = H * r.range(0.6, 1);
                const x = Math.cos(a) * d, z = Math.sin(a) * d;
                P('cyl5', x, -0.05, z, 0.025, h, 0.025, 0, 0, 0, C.stem, C.leaf);
                for (let p = 0; p < 4; p++) {
                    const pa = p * 1.57 + a;
                    P('octa', x + Math.cos(pa) * H * 0.08, h + H * 0.06, z + Math.sin(pa) * H * 0.08, H * 0.05, H * 0.13, H * 0.05, Math.sin(pa) * 0.6, 0, -Math.cos(pa) * 0.6, C.leaf, C.bloom, p % 2 === 0);
                }
                P('octa', x, h + H * 0.05, z, H * 0.05, H * 0.08, H * 0.05, 0, 0, 0, C.bloom, C.white, true);
            }
            return { top: H * 1.15, r: 0.6 };
        },
        'crystal-fern'(P, sp, H, C, r) {
            const n = 6 + sp.form;
            for (let k = 0; k < n; k++) frond(P, 0, 0.05, 0, k / n * TAU + r() * 0.4, r.range(0.6, 1.0), H * 1.1, H * 0.1, C.leaf, k % 2 ? C.leaf2 : mixc(C.bloom, C.white, 0.4), k % 2 === 0);
            return { top: H, r: H * 0.6 };
        },
        'frost-fern'(P, sp, H, C, r) {
            const n = 7 + sp.form;
            for (let k = 0; k < n; k++) frond(P, 0, 0.05, 0, k / n * TAU + r() * 0.4, r.range(0.5, 0.95), H * 1.15, H * 0.13, C.leafD, mixc(C.leaf2, C.white, 0.6));
            return { top: H, r: H * 0.7 };
        },
        'snow-moss'(P, sp, H, C, r) {
            const n = 2 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.3, 0.6) : 0, s = r.range(0.35, 0.6);
                P('hemi', Math.cos(a) * d, -0.05, Math.sin(a) * d, s, H * r.range(0.7, 1), s, 0, r() * TAU, 0, C.leafD, mixc(C.leaf2, C.white, 0.4));
                for (let j = 0; j < 2; j++) { const b = r() * TAU, rr = r.range(0, 0.6) * s; P('octa', Math.cos(a) * d + Math.cos(b) * rr, H * 0.85, Math.sin(a) * d + Math.sin(b) * rr, 0.05, 0.04, 0.05, 0, 0, 0, C.bloom, C.bloom); }
            }
            return { top: H, r: 0.9 };
        },
        'ice-bloom'(P, sp, H, C, r) {
            const n = 2 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.15, 0.4) : 0, h = H * r.range(0.65, 0.92);
                const x = Math.cos(a) * d, z = Math.sin(a) * d;
                P('cyl5', x, -0.05, z, 0.02, h, 0.02, 0, 0, 0, C.leafD, C.leaf);
                for (let p = 0; p < 4; p++) {
                    const pa = p / 4 * TAU + a;
                    P('octa', x + Math.cos(pa) * H * 0.06, h + H * 0.07, z + Math.sin(pa) * H * 0.06, H * 0.045, H * 0.12, H * 0.07, Math.sin(pa) * 0.45, -pa, -Math.cos(pa) * 0.45, mixc(C.bloom, C.white, 0.3), C.white);
                }
                P('ico0', x, h + H * 0.04, z, H * 0.04, H * 0.04, H * 0.04, 0, 0, 0, C.bloom, C.white, true);
            }
            return { top: H * 1.12, r: 0.5 };
        },
        'fire-flower'(P, sp, H, C, r) {
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.15, 0.5) : 0, h = H * r.range(0.6, 1);
                const x = Math.cos(a) * d, z = Math.sin(a) * d;
                P('cyl5', x, -0.05, z, 0.025, h, 0.025, 0, 0, 0, C.dark, C.stem);
                petals(P, x, h, z, H * 0.16, r.range(-0.3, 0.3), C.bloom, C.bloom2, true, r());
                P('octa', x, h + H * 0.04, z, H * 0.06, H * 0.06, H * 0.06, 0, 0, 0, C.bloom2, C.white, true);
            }
            return { top: H * 1.1, r: 0.55 };
        },
        'ember-palm'(P, sp, H, C, r) {
            const lean = 0.08 + Math.abs(sp.lean), len = H * 0.9, a0 = r() * TAU, lx = Math.cos(a0), lz = Math.sin(a0);
            P('cyl5', 0, -0.3, 0, H * 0.04, len, H * 0.04, lz * lean, 0, -lx * lean, C.dark, C.stem);
            const tx = lx * Math.sin(lean) * len, ty = -0.3 + Math.cos(lean) * len, tz = lz * Math.sin(lean) * len;
            const n = 6 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = k / n * TAU + r() * 0.3, rise = -r.range(0.2, 0.55), L = H * 0.45;
                frond(P, tx, ty, tz, a, rise, L, H * 0.08, C.dark, C.leaf);
                P('octa', tx + Math.cos(a) * Math.cos(rise) * L, ty + Math.sin(rise) * L, tz + Math.sin(a) * Math.cos(rise) * L, H * 0.05, H * 0.03, H * 0.05, 0, -a, 0, C.bloom, C.bloom2, true);
            }
            return { top: ty + H * 0.05, r: H * 0.42 };
        },
        'sky-plant'(P, sp, H, C, r) {
            // Floats: the base is the bottom of its trailing tendrils.
            const top = H * 0.75, n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = k / n * TAU + r() * 0.4, d = k ? H * 0.12 : 0, s = H * (k ? r.range(0.12, 0.18) : 0.22);
                P('ico1', Math.cos(a) * d, top + (k ? -s * 0.2 : s * 0.3), Math.sin(a) * d, s, s * 1.08, s, 0, r() * TAU, 0, mixc(C.bloom, C.white, 0.15), mixc(C.bloom, C.white, 0.5));
            }
            for (let k = 0; k < 4; k++) {
                const a = k * 1.57 + r() * 0.5, L = H * r.range(0.45, 0.7);
                P('cyl5', Math.cos(a) * H * 0.06, top - L - H * 0.1, Math.sin(a) * H * 0.06, H * 0.012, L, H * 0.012, 0, 0, 0, C.leafD, C.leaf);
            }
            for (let k = 0; k < 3; k++) frond(P, 0, top - H * 0.15, 0, k * 2.09 + r(), -0.4, H * 0.3, H * 0.08, C.leafD, C.leaf);
            return { top: H, r: H * 0.3 };
        },
        'sky-kelp'(P, sp, H, C, r) {
            const fy = H * 0.94;
            P('ico1', 0, fy, 0, H * 0.07, H * 0.08, H * 0.07, 0, 0, 0, mixc(C.bloom, C.white, 0.2), mixc(C.bloom, C.white, 0.5));
            const n = 3 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = k / n * TAU + r() * 0.5;
                let x = Math.cos(a) * H * 0.04, y = fy - H * 0.06, z = Math.sin(a) * H * 0.04;
                const segs = 3, L = H * r.range(0.75, 0.9) / segs;
                for (let j = 0; j < segs; j++) {
                    const sw = Math.sin(j * 1.3 + k) * 0.25;
                    P('octa', x, y - L * 0.5, z, H * 0.035, L * 0.55, H * 0.01, sw, -a, 0, C.leaf, C.leaf2);
                    x += Math.cos(a) * Math.sin(sw) * L * 0.4; z += Math.sin(a) * Math.sin(sw) * L * 0.4; y -= L;
                }
            }
            return { top: H, r: H * 0.15 };
        },
        lichen(P, sp, H, C, r) {
            const n = 4 + sp.form;
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = k ? r.range(0.2, 0.8) : 0, s = r.range(0.18, 0.4), c = k % 2 ? C.bloom : C.leaf;
                P('octa', Math.cos(a) * d, 0.01, Math.sin(a) * d, s, H * r.range(0.3, 0.6), s * r.range(0.6, 1), 0, r() * TAU, 0, mixc(c, C.dark, 0.3), c);
            }
            return { top: H, r: 0.9 };
        },
        cushion(P, sp, H, C, r) {
            const s = H * 1.2;
            P('hemi', 0, -0.05, 0, s, H, s, 0, r() * TAU, 0, C.leafD, C.leaf);
            for (let k = 0; k < 4; k++) { const a = r() * TAU, rr = r.range(0, 0.7) * s; P('octa', Math.cos(a) * rr, H * Math.sqrt(Math.max(0, 1 - (rr / s) * (rr / s))) * 0.95, Math.sin(a) * rr, 0.04, 0.03, 0.04, 0, 0, 0, C.bloom, C.bloom); }
            return { top: H, r: s };
        }
    };

    /**
     * Draw one plant of this species at (x, y, z) turned by yaw, `size` metres tall, into emit.
     * rnd: the caller's random stream (per-plant variety); a seeded one is used when missing.
     */
    /** True while drawing a standalone model (the scanner, the Field Guide): full detail. */
    let FULL = false;

    function draw(THREE, sp, x, y, z, yaw, size, emit, rnd) {
        const c = ctxFor(THREE);
        c.base.makeRotationY(yaw || 0);
        c.base.setPosition(x, y, z);
        const P = function (tpl, lx, ly, lz, sx, sy, sz, rx, ry, rz, c0, c1, glow) {
            c.q.setFromEuler(c.e.set(rx || 0, ry || 0, rz || 0));
            c.part.compose(c.v.set(lx, ly, lz), c.q, c.s.set(sx, sy, sz));
            c.out.multiplyMatrices(c.base, c.part);
            emit(tpl, c.out.elements, c0, c1 || c0, !!glow);
        };
        const fn = DRAW[sp.kind] || DRAW.bush;
        return fn(P, sp, size || sp.size, colsOf(sp), rnd || U.rng(U.hash('plant-draw', sp.seed)));
    }

    // --- templates and the standalone model -----------------------------------------------------------

    /** The same shape templates Fly Low uses (js/surface.js), so a plant looks the same in both. */
    let tplCache = null, tplTHREE = null;
    function templates(THREE) {
        if (tplTHREE === THREE && tplCache) return tplCache;
        function tpl(geo, baseAtZero) {
            const g = geo.index ? geo.toNonIndexed() : geo;
            const p = new Float32Array(g.attributes.position.array);
            let lo = Infinity, hi = -Infinity;
            for (let i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
            if (baseAtZero) { for (let i = 1; i < p.length; i += 3) p[i] -= lo; hi -= lo; lo = 0; }
            const ys = new Float32Array(p.length / 3);
            for (let i = 0; i < ys.length; i++) ys[i] = (p[i * 3 + 1] - lo) / ((hi - lo) || 1);
            if (g !== geo) g.dispose();
            geo.dispose();
            return { p: p, ys: ys };
        }
        tplCache = {
            cone6: tpl(new THREE.ConeGeometry(1, 1, 6, 1, true), true),
            cyl5: tpl(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), true),
            cyl8: tpl(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), true),
            ico0: tpl(new THREE.IcosahedronGeometry(1, 0), false),
            ico1: tpl(new THREE.IcosahedronGeometry(1, 1), false),
            hemi: tpl(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), true),
            cap: tpl(new THREE.SphereGeometry(1, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), true),
            octa: tpl(new THREE.OctahedronGeometry(1, 0), false),
            box: tpl(new THREE.BoxGeometry(1, 1, 1), true)
        };
        tplTHREE = THREE;
        return tplCache;
    }

    /** A plant on its own (the scanner's viewer): its height, radius, a gentle sway, dispose. */
    function build(THREE, sp, detail) {
        const T = templates(THREE);
        const lists = { s: { p: [], c: [] }, g: { p: [], c: [] } };
        const emit = function (tpl, e, c0, c1, glow) {
            const t = T[tpl] || T.ico0, L = glow ? lists.g : lists.s;
            const p = t.p, ys = t.ys;
            for (let i = 0, n = ys.length; i < n; i++) {
                const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], k = ys[i];
                L.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
                L.c.push(c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k);
            }
        };
        // Show it at its height, but the water plants whole and the floaters from their base.
        // (FULL: drawn up close, so the parts Fly Low leaves out under the water are drawn too.)
        let res;
        FULL = true;
        try { res = draw(THREE, sp, 0, 0, 0, 0, sp.size, emit, U.rng(U.hash('plant-model', sp.seed))); } finally { FULL = false; }
        const group = new THREE.Group();
        group.name = 'plant';
        const sway = new THREE.Group();
        group.add(sway);
        const geos = [], mats = [];
        let tris = 0;
        [['s', new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })], ['g', new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })]].forEach(function (pair) {
            const L = lists[pair[0]];
            if (!L.p.length) { pair[1].dispose(); return; }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(L.p, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(L.c, 3));
            g.computeVertexNormals();
            g.computeBoundingSphere();
            geos.push(g); mats.push(pair[1]);
            tris += L.p.length / 9;
            sway.add(new THREE.Mesh(g, pair[1]));
        });
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group);
        const height = Math.max(0.05, box.max.y - Math.min(0, box.min.y));
        const radius = Math.max(0.05, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2);
        const ph = (sp.seed % 1000) / 1000 * Math.PI * 2;
        const air = sp.habitat === 'air', sea = sp.habitat === 'sea';
        function update(dt, t) {
            t = (t || 0) + ph;
            // A slow sway (floaters bob); calm, never a shake.
            sway.rotation.z = (air ? 0.04 : sea ? 0.06 : 0.025) * Math.sin(t * 0.8);
            sway.rotation.x = (air ? 0.03 : 0.015) * Math.sin(t * 0.6 + 1);
            sway.position.y = air ? 0.1 * sp.size * 0.1 * Math.sin(t * 0.7) : 0;
        }
        function dispose() {
            geos.forEach(g => g.dispose());
            mats.forEach(m => m.dispose());
            geos.length = 0; mats.length = 0;
            if (group.parent) group.parent.remove(group);
        }
        return { group: group, height: height, radius: radius, top: res.top, hover: 0, focus: { x: 0, y: height * 0.6, z: 0 }, triangles: tris, update: update, dispose: dispose };
    }

    // --- field guide -----------------------------------------------------------------------------------

    const EXAMPLE_TYPE = {
        tree: 'earth', pine: 'earth', blossom: 'earth', 'jungle-tree': 'earth', palm: 'ocean', bush: 'earth', flower: 'earth', tallflower: 'earth', fern: 'earth',
        grass: 'earth', reed: 'earth', lily: 'earth', kelp: 'ocean', coral: 'ocean', cactus: 'desert', barrel: 'desert', succulent: 'desert', tumble: 'desert',
        mushroom: 'toxic', puffball: 'toxic', glowcap: 'toxic', pitcher: 'toxic', bubblepod: 'toxic', 'crystal-tree': 'crystal', 'crystal-flower': 'crystal',
        'crystal-fern': 'crystal', 'frost-fern': 'ice', 'snow-moss': 'ice', 'ice-bloom': 'ice', 'fire-flower': 'lava', 'ember-palm': 'lava', 'sky-plant': 'gas',
        'sky-kelp': 'gas', lichen: 'rock', cushion: 'rock'
    };
    const EX_PAL = {
        earth: { low: '#c8b47a', mid: '#4f8f3f', high: '#7a6a4a', peak: '#f2f2f2', sea: '#1f5aa0' }, ocean: { low: '#d8c58e', mid: '#2f9a7a', high: '#2b6f5a', peak: '#ffffff', sea: '#145a8c' },
        desert: { low: '#c8833f', mid: '#e0a75a', high: '#f0cf8a', peak: '#fff1d0', sea: '#000000' }, toxic: { low: '#4a5a1f', mid: '#7a8a2a', high: '#a8b83a', peak: '#d8e87a', sea: '#6aaa1f' },
        crystal: { low: '#5a3a8a', mid: '#8a5ad0', high: '#c8a0ff', peak: '#ffffff', sea: '#3a1f6a' }, ice: { low: '#5f88b8', mid: '#9cc4e6', high: '#dff2ff', peak: '#ffffff', sea: '#2c5d8a' },
        lava: { low: '#2a1a18', mid: '#3d2420', high: '#5a3326', peak: '#7a4a33', sea: '#ff5a1a' }, gas: { low: '#c8a57a', mid: '#e8d2a8', high: '#a87a52', peak: '#f4e8d0', sea: '#000000' },
        rock: { low: '#5a5650', mid: '#7a766e', high: '#9a958c', peak: '#c4beb4', sea: '#000000' }
    };
    const exampleCache = {};
    /** A plant of this kind, always the same one (field-guide portraits and silhouettes). */
    function example(kindId) {
        if (!K[kindId]) return null;
        if (exampleCache[kindId]) return exampleCache[kindId];
        const t = EXAMPLE_TYPE[kindId] || 'earth';
        const w = { type: t, palette: EX_PAL[t], seaLevel: 0.5, terrain: { style: kindId === 'crystal-tree' ? 'forest' : '' } };
        return (exampleCache[kindId] = spec(U.hash('plant-example', kindId), w, kindId));
    }

    return {
        KINDS: KINDS.map(k => ({ id: k.id, name: k.name, hint: k.hint })),
        kind: function (id) { return K[id] || null; },
        spec: spec,
        kindsOf: kindsOf,
        words: words,
        draw: draw,
        build: build,
        templates: templates,
        example: example,
        FACTS: FACTS
    };
})();
