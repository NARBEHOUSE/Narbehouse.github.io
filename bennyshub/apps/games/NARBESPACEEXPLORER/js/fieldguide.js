/**
 * NARBE Space Explorer - the Field Guide: everything there is to find, and what you have found
 * (localStorage, headless: the Node tests load it too).
 *
 * The user asked for a reason to come back ("make sure this game feels replayable") and for
 * "a ton of different animals and plants to identify". The guide is a collection book in pages:
 *
 *   Worlds        every kind of world (found by going into orbit)
 *   Landscapes    every kind of landscape on each kind of world (orbit)
 *   Stars         every kind of star (found by flying into its system)
 *   Animals       every kind of animal (found by scanning one; NSE.Creatures.KINDS)
 *   Plants        every kind of plant (found by scanning one; NSE.Flora.KINDS)
 *   Civilisations every way a people builds, and their technology (orbit an inhabited world)
 *   Rare Sights   comets, star whales, rainbow giants, golden creatures... (seen once to count)
 *
 * Things not found yet show as silhouettes with a hint, so there is always something to look
 * for. Each find remembers where it was (for Visit Again) and what it looked like (for its
 * picture). Every species scanned is counted too ("37 kinds of animals identified").
 */

window.NSE = window.NSE || {};

NSE.Guide = (function () {
    'use strict';

    const KEY = 'nse-guide-v1';
    const MAX_SPECIES = 4000;

    // --- what there is to find ------------------------------------------------------------------

    const WORLDS = [
        { id: 'world:earth', name: 'Earth-like World', hint: 'Land, seas and clouds, a bit like home.' },
        { id: 'world:ocean', name: 'Ocean World', hint: 'Almost all sea, with little islands.' },
        { id: 'world:ice', name: 'Ice World', hint: 'Frozen and cold, often far from its star.' },
        { id: 'world:desert', name: 'Desert World', hint: 'Dunes, mesas and dry canyons.' },
        { id: 'world:lava', name: 'Lava World', hint: 'Glowing rivers of melted rock, close to its star.' },
        { id: 'world:crystal', name: 'Crystal World', hint: 'Shining crystals in every colour.' },
        { id: 'world:toxic', name: 'Toxic World', hint: 'Green bubbling seas and thick haze.' },
        { id: 'world:gas', name: 'Gas Giant', hint: 'A huge ball of swirling clouds, often far out.' },
        { id: 'world:rock', name: 'Rocky Moon', hint: 'Grey dust and craters. Visit a moon.' }
    ];

    const TYPE_PHRASE = { earth: 'an earth-like world', ocean: 'an ocean world', ice: 'an ice world', desert: 'a desert world', lava: 'a lava world',
        crystal: 'a crystal world', toxic: 'a toxic world', gas: 'a gas giant', rock: 'a rocky moon' };

    /** Landscapes: [type, style, name]. Same styles as NSE.Universe.STYLES. */
    const LANDS = [
        ['earth', 'forest', 'Forests'], ['earth', 'meadow', 'Meadows'], ['earth', 'mountains', 'Mountains'], ['earth', 'lakes', 'Lake Lands'], ['earth', 'jungle', 'Jungle'],
        ['ocean', 'islands', 'Island Seas'], ['ocean', 'archipelago', 'Archipelago'], ['ocean', 'reefs', 'Coral Reefs'], ['ocean', 'open', 'Open Ocean'],
        ['ice', 'spires', 'Ice Spires'], ['ice', 'glaciers', 'Glaciers'], ['ice', 'cracked', 'Cracked Ice'], ['ice', 'snowfields', 'Snowfields'],
        ['desert', 'dunes', 'Sand Dunes'], ['desert', 'mesas', 'Mesas'], ['desert', 'canyons', 'Canyons'], ['desert', 'salt', 'Salt Flats'],
        ['lava', 'rivers', 'Lava Rivers'], ['lava', 'volcanoes', 'Volcanoes'], ['lava', 'cracked', 'Cracked Lava'],
        ['crystal', 'shards', 'Crystal Shards'], ['crystal', 'geodes', 'Geodes'], ['crystal', 'forest', 'Crystal Forest'],
        ['toxic', 'mushrooms', 'Mushroom Lands'], ['toxic', 'swamp', 'Toxic Swamp'], ['toxic', 'bubbles', 'Bubbling Pools'],
        ['gas', 'bands', 'Bold Bands'], ['gas', 'storms', 'Storm Giant'], ['gas', 'calm', 'Calm Giant'],
        ['rock', 'craters', 'Craters'], ['rock', 'boulders', 'Boulder Fields'], ['rock', 'canyons', 'Moon Canyons']
    ].map(function (l) {
        return { id: 'land:' + l[0] + ':' + l[1], name: l[2], type: l[0], hint: 'On ' + TYPE_PHRASE[l[0]] + '.' };
    });

    const STARS = [
        { id: 'star:yellow', name: 'Yellow Sun', hint: 'A warm star like our Sun. Very common.' },
        { id: 'star:orange', name: 'Orange Star', hint: 'A mellow star that shines for ages.' },
        { id: 'star:red', name: 'Red Dwarf', hint: 'Small, cool and the most common of all.' },
        { id: 'star:blue', name: 'Blue Giant', hint: 'Huge, bright and very hot.' },
        { id: 'star:white', name: 'White Dwarf', hint: 'The tiny glowing core of an old star.' },
        { id: 'star:binary', name: 'Binary Stars', hint: 'Two stars circling each other.' },
        { id: 'star:nebula', name: 'Nebula', hint: 'A young star inside a glowing cloud. Uncommon.' },
        { id: 'star:blackhole', name: 'Black Hole', hint: 'Very rare. Its glowing disk spins round a dark heart.' }
    ];

    const CIVS = [
        { id: 'civ:spires', name: 'Glass Tower Cities', hint: 'A people who build tall glass towers.' },
        { id: 'civ:organic', name: 'Tree Cities', hint: 'Cities grown like giant trees.' },
        { id: 'civ:domes', name: 'Dome Cities', hint: 'Cities under great glowing domes.' },
        { id: 'civ:arcology', name: 'Mountain Cities', hint: 'Giant cities built like mountains.' },
        { id: 'civ:floating', name: 'Floating Cities', hint: 'Cities that float over seas or in the clouds.' },
        { id: 'civ:crystal', name: 'Crystal Cities', hint: 'Cities of shining crystal. Look on crystal worlds.' },
        { id: 'tech:ring', name: 'Orbital Ring', hint: 'A giant ring around a whole planet.' },
        { id: 'tech:elevator', name: 'Space Elevator', hint: 'A cable that climbs from the ground up to space.' },
        { id: 'tech:maglev', name: 'Floating Trains', hint: 'Fast trains on floating rails between cities.' },
        { id: 'tech:skyships', name: 'Sky Ships', hint: 'Great ships that sail through the sky.' },
        { id: 'tech:drones', name: 'Drones', hint: 'Busy little flying helpers.' },
        { id: 'tech:beacons', name: 'Light Beacons', hint: 'Tall towers of light.' },
        { id: 'tech:solar', name: 'Solar Farms', hint: 'Fields of shining solar panels. Often in deserts.' },
        { id: 'tech:farms', name: 'Patchwork Farms', hint: 'Neat fields around the cities.' }
    ];

    /** Rare sights: id -> name, hint (in the guide) and what is said when one is found. */
    const RARE = [
        { id: 'rare:comet', name: 'Comet', hint: 'Sweeps through some star systems. Look around when you arrive somewhere new.', say: 'A comet! A ball of ice and dust, with a glowing tail that always points away from its star.' },
        { id: 'rare:whales', name: 'Star Whales', hint: 'Swim through some systems, most often inside glowing nebulae.', say: 'Star whales! Gentle giants that swim through space, singing to each other.' },
        { id: 'rare:rainbow', name: 'Rainbow Giant', hint: 'A gas giant striped with every colour.', say: 'A rainbow giant! A gas giant striped with every colour.' },
        { id: 'rare:doublering', name: 'Double Rings', hint: 'A ringed gas giant with a second set of rings.', say: 'Double rings! This giant has two sets of rings, tipped different ways.' },
        { id: 'rare:glowsea', name: 'Glowing Seas', hint: 'Seas that glow at night, full of tiny living lights.', say: 'Glowing seas! Tiny living lights make its seas glow at night.' },
        { id: 'rare:aurora', name: 'Auroras', hint: 'Coloured lights dancing round the poles of a world with air.', say: 'Auroras! Curtains of coloured light dance around its poles.' },
        { id: 'rare:ringedmoon', name: 'Ringed Moon', hint: 'A little moon with rings of its own.', say: 'A ringed moon! A little moon with rings of its own.' },
        { id: 'rare:rainbowsky', name: 'Rainbow', hint: 'Fly Low over a world with seas and clouds.', say: 'A rainbow! Sunshine and rain together.' },
        { id: 'rare:golden', name: 'Golden Creature', hint: 'A shining golden animal. Scan or fly low over worlds with life.', say: 'A golden creature! A rare, shining golden one.' },
        { id: 'rare:giant', name: 'Gentle Giant', hint: 'An enormous, calm animal. Fly low over worlds with life.', say: 'A gentle giant! An enormous, calm creature.' }
    ];

    /** If the creature or plant modules have no kind list (old copy), these stand in. */
    const FALLBACK_ANIMALS = ['fluff', 'smooth', 'pear', 'balloon', 'grazer', 'stocky', 'lithe', 'pup', 'crawler', 'dino', 'upright', 'hopper', 'frog', 'ray', 'slug', 'octo', 'crab',
        'caterpillar', 'noodle', 'bell', 'siphon', 'tortoise', 'pillbug', 'beetle', 'snail', 'bird', 'moth', 'bat'].map(v => ({ id: v, name: v.charAt(0).toUpperCase() + v.slice(1), hint: '' }));

    function animalKinds() { return (NSE.Creatures && NSE.Creatures.KINDS) || FALLBACK_ANIMALS; }
    function plantKinds() { return (NSE.Flora && NSE.Flora.KINDS) || []; }

    function cats() {
        return [
            { id: 'worlds', name: 'Worlds', icon: 'planet', tone: 'teal', items: WORLDS },
            { id: 'lands', name: 'Landscapes', icon: 'low', tone: 'green', items: LANDS },
            { id: 'stars', name: 'Stars', icon: 'star', tone: 'help', items: STARS },
            { id: 'animals', name: 'Animals', icon: 'paw', tone: 'blue', items: animalKinds().map(k => ({ id: 'animal:' + k.id, kind: k.id, name: k.name, hint: k.hint || '' })) },
            { id: 'plants', name: 'Plants', icon: 'leaf', tone: 'green', items: plantKinds().map(k => ({ id: 'plant:' + k.id, kind: k.id, name: k.name, hint: k.hint || '' })) },
            { id: 'civs', name: 'Civilisations', icon: 'city', tone: 'plum', items: CIVS },
            { id: 'rare', name: 'Rare Sights', icon: 'sparkle', tone: 'help', items: RARE }
        ].filter(c => c.items.length);
    }

    function itemById(id) {
        const all = cats();
        for (let i = 0; i < all.length; i++) {
            const it = all[i].items.find(x => x.id === id);
            if (it) return { item: it, cat: all[i] };
        }
        return null;
    }

    // --- what you have found ----------------------------------------------------------------------

    let book = { found: {}, animals: [], plants: [] };

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                const b = JSON.parse(raw);
                if (b && b.found) book = { found: b.found, animals: Array.isArray(b.animals) ? b.animals : [], plants: Array.isArray(b.plants) ? b.plants : [] };
            }
        } catch (e) { /* unreadable: a fresh guide */ }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(book)); return true; } catch (e) { return false; }
    }

    function has(id) { return !!book.found[id]; }
    function get(id) { return book.found[id] || null; }

    /**
     * Note a find. where = { id, name, galaxyName } (a place, for Visit Again), look = what it
     * looked like (palette, seed...). Returns true the first time.
     */
    function find(id, where, look) {
        if (!id || book.found[id] || !itemById(id)) return false;
        book.found[id] = { t: Date.now(), where: where || null, look: look || null };
        save();
        return true;
    }

    /** A species scanned (kind 'animals' or 'plants', its seed). Returns true the first time. */
    function species(kind, seed) {
        const list = kind === 'plants' ? book.plants : book.animals;
        seed = seed >>> 0;
        if (list.indexOf(seed) >= 0) return false;
        list.push(seed);
        if (list.length > MAX_SPECIES) list.shift();
        save();
        return true;
    }

    function count(cat) { return cat.items.filter(it => has(it.id)).length; }

    function stats() {
        const all = cats();
        let found = 0, total = 0;
        all.forEach(c => { total += c.items.length; found += count(c); });
        return { found: found, total: total, animals: book.animals.length, plants: book.plants.length };
    }

    function clear() {
        book = { found: {}, animals: [], plants: [] };
        try { localStorage.removeItem(KEY); } catch (e) { /* none */ }
    }

    load();

    return {
        cats: cats,
        item: itemById,
        rare: function (id) { return RARE.find(r => r.id === id) || null; },
        has: has,
        get: get,
        find: find,
        species: species,
        count: count,
        stats: stats,
        clear: clear,
        LANDS: LANDS,
        _reload: load
    };
})();
