/**
 * NARBE Space Explorer - the procedural universe (headless, Node-testable).
 *
 * Nothing is stored: a galaxy seed and a sector key decide everything, so the
 * same planet looks the same on every visit.
 *
 *   galaxy(seed)                     name, look of the galaxy, its map
 *   systemAt(galaxySeed, ix, iy, iz) the star system in one sector cube, or null
 *   systemsNear(galaxySeed, pos, r)  every system within r sectors of a point
 *   objectsOf(system)                the stars and planets the ship can visit
 *
 * Space is laid out in sector cubes of SECTOR units. Most hold one system,
 * jittered inside the cube so two systems are never close. A system is a star
 * (or a pair, or a nebula's young star, or a black hole) with planets on
 * circular orbits in a gently tilted plane. Planets hold still on their orbits
 * (spinning on their axes); moons circle their planets.
 *
 * The ship flies at an accelerated, not-to-scale pace: planets are tens of
 * units across, orbits hundreds, systems thousands apart.
 */

window.NSE = window.NSE || {};

NSE.Universe = (function () {
    'use strict';

    const U = NSE.Util;
    const SECTOR = 6000;
    const JITTER = 0.06;
    /** No system reaches further than this from its star (so neighbours never overlap). */
    const MAX_SYSTEM_RADIUS = SECTOR / 2 - SECTOR * JITTER - 160;
    const HOME_GALAXY = 1;

    // --- names --------------------------------------------------------------------------------

    const SYL_A = ['ka', 'thor', 'vel', 'ix', 'ara', 'zen', 'mo', 'lu', 'qua', 'dra', 'sol', 'ne', 'tor', 'ri', 'ven',
        'ul', 'kae', 'bo', 'pha', 'sy', 'or', 'li', 'gal', 'xo', 'tu', 'mira', 'ce', 'no', 'va', 'ze', 'ory', 'en', 'ta', 'po', 'sha'];
    const SYL_B = ['ra', 'lon', 'dar', 'ris', 'nos', 'mar', 'tis', 'van', 'lia', 'rex', 'dus', 'nae', 'lex', 'ron', 'tha',
        'vos', 'mir', 'kos', 'sia', 'tar', 'quin', 'bel', 'lys', 'gon', 'zar', 'ix', 'ara', 'on', 'eth', 'ura'];
    /** Sillier sounds for creatures and alien peoples. */
    const SYL_C = ['blor', 'zib', 'glo', 'fwee', 'mub', 'snor', 'quib', 'wob', 'plin', 'grub', 'zoo', 'bop', 'flim',
        'nub', 'skree', 'doo', 'jib', 'wum', 'pob', 'yib', 'gloop', 'tik', 'bix', 'zorp', 'wiggle', 'fizz', 'mop', 'boing'];
    const SYL_D = ['bix', 'ble', 'zoid', 'ling', 'mop', 'nik', 'oo', 'wump', 'squee', 'pod', 'let', 'ster', 'zer', 'bo', 'kin', 'flop'];

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    /**
     * Never a rude word, whatever the syllables happen to spell (players and families read
     * and hear every name). A name containing one of these is drawn again.
     */
    const RUDE = ['shit', 'fuk', 'fuc', 'cunt', 'dick', 'cock', 'puss', 'slut', 'whor', 'nig', 'fag', 'rape', 'anal', 'anus',
        'piss', 'tit', 'cum', 'butt', 'arse', 'ass', 'boob', 'sex', 'porn', 'nazi', 'hitler', 'tard', 'jizz', 'wank', 'spaz',
        'crap', 'poop', 'pee', 'damn', 'hell', 'kill', 'dead', 'die', 'kkk', 'homo', 'turd', 'bum', 'fart', 'suck', 'lsd', 'nob', 'twat', 'prick'];
    function rude(s) { s = s.toLowerCase(); return RUDE.some(w => s.indexOf(w) >= 0); }

    /** Two or three syllables: "Velara", "Kathorix". Same seed, same name. */
    function placeName(seed) {
        for (let k = 0; k < 20; k++) {
            const s = placeNameTry(k ? U.hash(seed, 'again', k) : seed);
            if (!rude(s)) return s;
        }
        return 'Vela';
    }

    function placeNameTry(seed) {
        const r = U.rng(U.hash('name', seed));
        const n = r.chance(0.55) ? 2 : 3;
        let s = r.pick(SYL_A), next = '';
        for (let i = 1; i < n; i++) {
            next = r.pick(i === n - 1 ? SYL_B : SYL_A);
            // Never a run of three vowels or the same syllable twice.
            if (/[aeiouy]$/.test(s) && /^[aeiouy]/.test(next) && /[aeiouy]{2}$/.test(s)) next = 'r' + next;
            if (s.endsWith(next)) next = r.pick(SYL_B);
            s += next;
        }
        // Long names are hard to say and to read: keep them to about three short beats.
        if (s.length > 9) s = s.slice(0, s.length - next.length) + r.pick(['ra', 'on', 'is', 'ar', 'ix']);
        return cap(s);
    }

    function creatureName(seed) {
        for (let k = 0; k < 20; k++) {
            const r = U.rng(U.hash('critter', seed, k));
            let s = r.pick(SYL_C) + r.pick(SYL_D);
            if (r.chance(0.25)) s = r.pick(SYL_C) + s;
            if (!rude(s)) return cap(s);
        }
        return 'Blorbix';
    }

    // --- galaxies -------------------------------------------------------------------------------

    const GALAXY_KINDS = [['spiral', 6], ['barred spiral', 3], ['ring', 1.4], ['elliptical', 1.6], ['irregular', 1.2]];

    /**
     * Colour schemes, so galaxies look like different places: the glowing core, the arms,
     * the dark dust, glowing nebulae, and a tint for the background stars.
     */
    const SCHEMES = {
        classic: { core: '#fff4dc', arm: '#9ab8ff', dust: '#1a1810', neb: ['#ff7aa0', '#7ab0ff'], tint: [1, 0.97, 0.92] },
        golden: { core: '#fff1c8', arm: '#ffcf7a', dust: '#3a2410', neb: ['#ff9a6a', '#ffd27a'], tint: [1, 0.92, 0.78] },
        icy: { core: '#eaf6ff', arm: '#7fc8ff', dust: '#0c2236', neb: ['#6ad8ff', '#a8b8ff'], tint: [0.82, 0.9, 1] },
        rose: { core: '#ffe6ee', arm: '#ff8ab8', dust: '#3a1024', neb: ['#ff6aa8', '#ffb0d0'], tint: [1, 0.86, 0.92] },
        emerald: { core: '#eaffe8', arm: '#6ae8a0', dust: '#0e2a1a', neb: ['#4affb0', '#b8ff6a'], tint: [0.86, 1, 0.9] },
        violet: { core: '#f2e8ff', arm: '#a87aff', dust: '#1e1036', neb: ['#c06aff', '#6a8aff'], tint: [0.9, 0.86, 1] },
        ember: { core: '#fff0d0', arm: '#ff7a3a', dust: '#2e0e06', neb: ['#ff5a3a', '#ffb03a'], tint: [1, 0.84, 0.7] },
        aurora: { core: '#e8fff8', arm: '#5affd8', dust: '#082a2a', neb: ['#5aff9a', '#c06aff'], tint: [0.85, 1, 0.96] },
        rainbow: { core: '#ffffff', arm: '#ff8ad8', dust: '#1a1430', neb: ['#ff6a6a', '#6aff9a', '#6aa8ff', '#ffd86a'], tint: [1, 1, 1], rainbow: true }
    };
    const SCHEME_NAMES = Object.keys(SCHEMES);

    const galaxyCache = new Map();
    function galaxy(seed) {
        seed = seed >>> 0;
        if (galaxyCache.has(seed)) return galaxyCache.get(seed);
        const r = U.rng(U.hash('galaxy', seed));
        const kind = seed === HOME_GALAXY ? 'spiral' : r.weighted(GALAXY_KINDS);
        const scheme = seed === HOME_GALAXY ? 'classic' : r.pick(SCHEME_NAMES);
        const S = SCHEMES[scheme];
        // A little hue turn of the scheme, so two galaxies of one scheme still differ.
        const dh = r.range(-18, 18);
        const tone = c => U.shiftHex(c, dh, r.range(0.9, 1.15), 1);
        const comps = [];
        const nComp = r.weighted([[0, 3], [1, 3], [2, 2], [3, 1]]);
        for (let i = 0; i < nComp; i++) comps.push({ a: r.range(0, Math.PI * 2), dist: r.range(1.35, 2.3), size: r.range(0.1, 0.28), tilt: r.range(0, Math.PI), color: tone(r.pick([S.core, S.arm].concat(S.neb))) });
        const g = {
            seed: seed,
            name: placeName(U.hash('gname', seed)),
            kind: kind,
            scheme: scheme,
            rainbow: !!S.rainbow,
            arms: kind === 'spiral' ? r.weighted([[1, 0.6], [2, 4], [3, 2], [4, 1.5], [5, 0.8], [6, 0.5]]) : kind === 'barred spiral' ? r.int(2, 4) : 0,
            twist: r.range(1.6, 5),
            armWidth: r.range(0.15, 0.5),
            bulge: r.range(0.1, 0.45),
            bar: r.range(0.18, 0.42),
            ringR: r.range(0.5, 0.85),
            flat: r.range(0.5, 1),
            clumps: r.int(3, 16),
            nebulae: r.int(4, 18),
            companions: comps,
            hue: U.toHsl(U.hex(S.arm))[0] + dh,
            core: tone(S.core),
            arm: tone(S.arm),
            dust: tone(S.dust),
            neb: S.neb.map(tone),
            tint: S.tint,
            /** The band of distant stars across the sky (painted in js/space.js). */
            skyBand: r.range(0.1, 0.3),
            skyBright: r.range(0.75, 1.3),
            skyNebulae: r.int(2, 8),
            tilt: r.range(-0.6, 0.6),
            /** How many systems the galaxy has, roughly, for the map's words. */
            billions: r.int(40, 900)
        };
        galaxyCache.set(seed, g);
        if (galaxyCache.size > 64) galaxyCache.delete(galaxyCache.keys().next().value);
        return g;
    }

    /**
     * The galaxy's shape as stars, for the outside view and the map (they always match):
     * n stars in a disk of radius 1 (x, z across; y thin), with colours; plus bright star
     * clusters and glowing nebulae along the arms.
     */
    function galaxyPoints(g, n) {
        const r = U.rng(U.hash('gpts', g.seed));
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        const core = U.hex(g.core), arm = U.hex(g.arm);
        const armCols = [];
        for (let k = 0; k < Math.max(1, g.arms); k++) armCols.push(g.rainbow ? U.hsl(k / Math.max(1, g.arms) * 360 + g.hue, 0.75, 0.66) : arm);
        const gauss = () => (r() + r() + r() - 1.5) / 1.5;
        // Clumps (irregular galaxies are made of them).
        const blobs = [];
        for (let i = 0; i < Math.max(3, g.clumps); i++) blobs.push({ x: r.range(-0.8, 0.8), z: r.range(-0.6, 0.6), s: r.range(0.08, 0.3) });
        function place(i, out) {
            let x, z, y, t, ac = arm;
            const inBulge = r() < g.bulge * (g.kind === 'elliptical' ? 2 : 0.7);
            if (g.kind === 'elliptical') {
                const a = r.range(0, Math.PI * 2), d = Math.pow(r(), 1.7);
                x = Math.cos(a) * d; z = Math.sin(a) * d * g.flat; t = d;
                y = gauss() * 0.35 * (1 - d * 0.5);
            } else if (g.kind === 'irregular') {
                const b = blobs[i % blobs.length];
                x = b.x + gauss() * b.s; z = b.z + gauss() * b.s; t = Math.min(1, Math.hypot(x, z));
                y = gauss() * 0.05;
            } else if (inBulge) {
                x = gauss() * g.bulge; z = gauss() * g.bulge; t = Math.hypot(x, z) * 0.5;
                y = gauss() * g.bulge * 0.6;
            } else if (g.kind === 'ring') {
                const a = r.range(0, Math.PI * 2), d = g.ringR + gauss() * 0.08;
                x = Math.cos(a) * d; z = Math.sin(a) * d; t = d;
                y = gauss() * 0.03;
            } else {
                const k = i % g.arms;
                t = Math.pow(r(), 0.8);
                if (g.kind === 'barred spiral' && t < g.bar) {
                    x = r.range(-g.bar, g.bar); z = gauss() * 0.05;
                } else {
                    // Full, soft arms: spread round the arm and a little in and out.
                    const a = t * g.twist * Math.PI + k * Math.PI * 2 / g.arms + gauss() * g.armWidth * 2.2 * (1.2 - t * 0.5);
                    const rr = t * (1 + gauss() * g.armWidth * 0.35);
                    x = Math.cos(a) * rr; z = Math.sin(a) * rr;
                }
                ac = armCols[k];
                y = gauss() * 0.04 * (1 - t * 0.6);
            }
            const c = r() < 0.2 ? [1, 1, 1] : U.mix(ac, core, U.clamp(1 - t * 1.7, 0, 1));
            const bright = r.range(0.4, 1);
            out.x = x; out.y = y; out.z = z; out.c = [c[0] * bright, c[1] * bright, c[2] * bright];
        }
        const o = {};
        for (let i = 0; i < n; i++) {
            place(i, o);
            pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
            col[i * 3] = o.c[0]; col[i * 3 + 1] = o.c[1]; col[i * 3 + 2] = o.c[2];
        }
        // Bright clusters and glowing nebulae sit on the arms (or the ring, or the clumps).
        const clusters = [], nebulae = [];
        for (let i = 0; i < g.clumps; i++) { place(i * 7 + 3, o); clusters.push({ x: o.x, y: o.y, z: o.z, size: r.range(0.03, 0.07) }); }
        for (let i = 0; i < g.nebulae; i++) { place(i * 11 + 5, o); nebulae.push({ x: o.x, y: o.y, z: o.z, size: r.range(0.05, 0.14), color: r.pick(g.neb) }); }
        return { pos: pos, col: col, n: n, clusters: clusters, nebulae: nebulae };
    }

    function galaxyLabel(g) {
        return 'the ' + g.name + ' Galaxy';
    }

    // --- stars ----------------------------------------------------------------------------------

    const STAR_TYPES = {
        yellow: { label: 'a yellow sun', short: 'Yellow Sun', color: '#ffe9a6', light: '#fff2d6', radius: [34, 46], temp: [5300, 6200] },
        red: { label: 'a red dwarf', short: 'Red Dwarf', color: '#ff8a5c', light: '#ffc3a0', radius: [20, 28], temp: [2600, 3800] },
        blue: { label: 'a blue giant', short: 'Blue Giant', color: '#a9c8ff', light: '#dfe9ff', radius: [62, 86], temp: [15000, 32000] },
        white: { label: 'a white dwarf', short: 'White Dwarf', color: '#f4f7ff', light: '#ffffff', radius: [12, 16], temp: [8000, 25000] },
        orange: { label: 'an orange star', short: 'Orange Star', color: '#ffc27a', light: '#ffdcb0', radius: [28, 38], temp: [3900, 5200] },
        blackhole: { label: 'a black hole', short: 'Black Hole', color: '#000000', light: '#ffb070', radius: [26, 34], temp: [0, 0] }
    };

    const SYSTEM_KINDS = [['yellow', 26], ['orange', 14], ['red', 24], ['blue', 9], ['white', 8], ['binary', 12], ['nebula', 5], ['blackhole', 2.5]];

    function makeStar(r, type, name) {
        const T = STAR_TYPES[type];
        return {
            type: type,
            name: name,
            label: T.label,
            short: T.short,
            color: T.color,
            light: T.light,
            radius: Math.round(r.range(T.radius[0], T.radius[1])),
            temperature: Math.round(r.range(T.temp[0], T.temp[1]) / 100) * 100
        };
    }

    // --- planets --------------------------------------------------------------------------------

    /** Each kind of world: its words, colours (low ground to peaks, sea), and what it tends to have. */
    const PLANET_TYPES = {
        ice: {
            label: 'an ice world', short: 'Ice World', sea: 0.35, clouds: [0.15, 0.5], atmo: '#bfe6ff',
            pal: () => [['#5f88b8', '#9cc4e6', '#dff2ff', '#ffffff'], ['#6b7fa8', '#a8b9e0', '#e6ecff', '#ffffff'], ['#4f9aa6', '#8fd3d9', '#e4fbff', '#ffffff']],
            seaCol: ['#2c5d8a', '#3a6f9c', '#2a6f86'], temp: [-210, -40], life: 0.35, civ: 0.08
        },
        ocean: {
            label: 'an ocean world', short: 'Ocean World', sea: 0.72, clouds: [0.35, 0.7], atmo: '#79b8ff',
            pal: () => [['#c9b77a', '#5f9a4a', '#3f7a3a', '#e8efe6'], ['#d8c58e', '#2f9a7a', '#2b6f5a', '#ffffff'], ['#e2d29a', '#7fae52', '#4b7d36', '#f4f4f0']],
            seaCol: ['#1b4f9a', '#145a8c', '#1d3f8f', '#0f6a8a'], temp: [2, 30], life: 0.78, civ: 0.16
        },
        earth: {
            label: 'an earth-like world', short: 'Earth-like World', sea: 0.5, clouds: [0.3, 0.6], atmo: '#7fb6ff',
            pal: () => [['#c8b47a', '#4f8f3f', '#7a6a4a', '#f2f2f2'], ['#d2be86', '#3d7f3d', '#6b5b45', '#ffffff'], ['#bfa86a', '#6a9a3a', '#8a6f4a', '#eeeeee'], ['#c9a37a', '#8a6abf', '#5b4a7a', '#ffffff']],
            seaCol: ['#1f5aa0', '#235f9a', '#1b4d8a'], temp: [5, 32], life: 0.88, civ: 0.32
        },
        desert: {
            label: 'a desert world', short: 'Desert World', sea: 0, clouds: [0, 0.18], atmo: '#ffcf96',
            pal: () => [['#c8833f', '#e0a75a', '#f0cf8a', '#fff1d0'], ['#b5603a', '#d8854f', '#efb07a', '#ffe2c4'], ['#a8925a', '#cdb47a', '#e8d6a4', '#fff6e0']],
            seaCol: ['#000000'], temp: [30, 75], life: 0.45, civ: 0.16
        },
        lava: {
            label: 'a lava world', short: 'Lava World', sea: 0.42, clouds: [0.1, 0.35], atmo: '#ff8a4a',
            pal: () => [['#2a1a18', '#3d2420', '#5a3326', '#7a4a33'], ['#1f1a1f', '#352b30', '#4d3a3a', '#6b5048']],
            seaCol: ['#ff5a1a', '#ff7a1f', '#ff3d12'], seaGlow: true, temp: [320, 950], life: 0.15, civ: 0.05
        },
        crystal: {
            label: 'a crystal world', short: 'Crystal World', sea: 0.2, clouds: [0, 0.25], atmo: '#e2a8ff',
            pal: () => [['#5a3a8a', '#8a5ad0', '#c8a0ff', '#ffffff'], ['#2f6a8a', '#4fb0d0', '#a8f0ff', '#ffffff'], ['#8a3a6a', '#d05aa0', '#ffa8e0', '#ffffff']],
            seaCol: ['#3a1f6a', '#1f3f6a', '#5a1f4f'], temp: [-80, 40], life: 0.4, civ: 0.2
        },
        toxic: {
            label: 'a toxic world', short: 'Toxic World', sea: 0.4, clouds: [0.45, 0.85], atmo: '#b6ff6a',
            pal: () => [['#4a5a1f', '#7a8a2a', '#a8b83a', '#d8e87a'], ['#3a4a3a', '#5a7a3a', '#8ab04a', '#c8f07a'], ['#5a4a1f', '#8a7a2a', '#c0b03a', '#ecdf7a']],
            seaCol: ['#6aaa1f', '#3a8a3a', '#8aa01a'], seaGlow: true, temp: [45, 210], life: 0.5, civ: 0.15
        },
        gas: {
            label: 'a gas giant', short: 'Gas Giant', sea: 0, clouds: [0, 0], atmo: '#ffd9a8',
            pal: () => [['#c8a57a', '#e8d2a8', '#a87a52', '#f4e8d0'], ['#7aa0c8', '#a8c8e8', '#4f7aa8', '#e0ecf8'], ['#c87a5a', '#e8b08a', '#a85a3a', '#f8dcc8'], ['#9a8ac8', '#c8b8f0', '#6a5aa0', '#ece4ff'], ['#8ab08a', '#c0dcb0', '#5a8a5a', '#e8f4dc']],
            seaCol: ['#000000'], temp: [-220, -110], life: 0.3, civ: 0.04
        },
        rock: {
            label: 'a rocky moon', short: 'Rocky Moon', sea: 0, clouds: [0, 0], atmo: null,
            pal: () => [['#5a5650', '#7a766e', '#9a958c', '#c4beb4'], ['#5a4a42', '#7a6a5e', '#a08e7e', '#cfc0b0'], ['#4a4e56', '#6a707a', '#9098a4', '#c8ccd4']],
            seaCol: ['#000000'], temp: [-170, 120], life: 0.05, civ: 0
        }
    };

    const PLANET_MIX = [['earth', 15], ['ocean', 13], ['desert', 14], ['ice', 14], ['lava', 10], ['crystal', 8], ['toxic', 10], ['gas', 22]];
    const MOON_MIX = [['rock', 40], ['ice', 22], ['desert', 8], ['lava', 8], ['crystal', 8], ['toxic', 6], ['ocean', 4], ['earth', 4]];

    /**
     * Terrain styles: each world type comes in several kinds of landscape (it changes the planet
     * from orbit, and the Fly Low scenery: js/surface.js reads world.terrain.style).
     */
    const STYLES = {
        ice: ['spires', 'glaciers', 'cracked', 'snowfields'],
        ocean: ['islands', 'archipelago', 'reefs', 'open'],
        earth: ['forest', 'meadow', 'mountains', 'lakes', 'jungle'],
        desert: ['dunes', 'mesas', 'canyons', 'salt'],
        lava: ['rivers', 'volcanoes', 'cracked'],
        crystal: ['shards', 'geodes', 'forest'],
        toxic: ['mushrooms', 'swamp', 'bubbles'],
        gas: ['bands', 'storms', 'calm'],
        rock: ['craters', 'boulders', 'canyons']
    };
    /** How far round the colour wheel a world's colours may turn from its type's palette. */
    const HUE_SPAN = { gas: 180, crystal: 180, toxic: 70, ice: 35, rock: 25, lava: 18, desert: 25, earth: 30, ocean: 30 };

    /**
     * More variety: a terrain style and a seeded colour shift for every world. Drawn from its
     * own random stream after everything else, so a world's name, size, moons and place never
     * change because of it.
     */
    function vary(w) {
        const r = U.rng(U.hash('variety', w.seed));
        const T = w.terrain, type = w.type;
        T.style = r.pick(STYLES[type]);
        const span = HUE_SPAN[type] || 25;
        const dh = r.range(-span, span), ks = r.range(0.8, 1.25), kl = r.range(0.88, 1.12);
        ['low', 'mid', 'high', 'peak'].forEach(k => { w.palette[k] = U.shiftHex(w.palette[k], dh, ks, k === 'peak' ? 1 : kl); });
        if (type === 'crystal' || type === 'toxic' || type === 'ocean' || type === 'ice') w.palette.sea = U.shiftHex(w.palette.sea, dh * 0.6, ks, 1);
        if (w.atmosphere && span >= 60) w.atmosphere.color = U.shiftHex(w.atmosphere.color, dh * 0.7, 1, 1);
        // Each style shapes the land a little differently.
        switch (T.style) {
            case 'archipelago': w.seaLevel = Math.min(0.85, w.seaLevel + 0.08); T.scale *= 1.6; break;
            case 'open': w.seaLevel = Math.min(0.9, w.seaLevel + 0.14); break;
            case 'reefs': T.roughness = Math.min(0.85, T.roughness + 0.1); T.scale *= 2; break;
            case 'mountains': case 'glaciers': T.ridges = Math.min(1, T.ridges + 0.45); T.roughness = Math.min(0.85, T.roughness + 0.08); break;
            case 'meadow': case 'snowfields': case 'salt': case 'calm': T.ridges *= 0.3; T.roughness *= 0.85; break;
            case 'lakes': if (w.seaLevel >= 0) w.seaLevel = Math.max(0.3, w.seaLevel - 0.12); T.scale *= 1.8; break;
            case 'jungle': w.palette.mid = U.shiftHex(w.palette.mid, 0, 1.2, 0.8); break;
            case 'canyons': case 'cracked': T.ridges = Math.min(1, T.ridges + 0.6); T.scale *= 1.3; break;
            case 'mesas': T.roughness = Math.min(0.85, T.roughness + 0.12); break;
            case 'volcanoes': case 'craters': T.craters = Math.max(T.craters, 0.55); break;
            case 'boulders': T.roughness = Math.min(0.85, T.roughness + 0.15); break;
            case 'storms': T.storm = true; T.bands = Math.max(T.bands, 12); break;
            case 'swamp': if (w.seaLevel >= 0) w.seaLevel = Math.min(0.75, w.seaLevel + 0.12); break;
            case 'geodes': T.craters = Math.max(T.craters, 0.4); break;
            default: break;
        }
        if (T.style === 'salt') { w.palette.high = U.shiftHex(w.palette.high, 0, 0.35, 1.3); w.palette.peak = '#ffffff'; }
        return w;
    }

    /**
     * What grows on a world, in words (they match the Fly Low scenery). Null when nothing grows:
     * a world grows plants when it has flora (w.flora, from enrich()).
     */
    function plants(w) {
        if (!w.flora) return null;
        const st = w.terrain.style;
        return ({
            earth: st === 'jungle' ? 'thick jungle' : st === 'meadow' ? 'grass, bushes and trees' : 'trees and bushes',
            ocean: 'palm trees on the islands',
            desert: 'cactus plants',
            toxic: 'giant mushrooms',
            crystal: st === 'forest' ? 'trees made of crystal' : 'crystal flowers',
            ice: 'frost ferns and snow moss',
            lava: 'fire flowers that love the heat',
            gas: 'floating sky plants',
            rock: 'tough little lichens'
        })[w.type] || 'strange plants';
    }

    // --- a richer world: more life, plants, grander (and rarer) civilisations, rare sights ---------

    /**
     * How often a world with life has an advanced civilisation. Rare (the user: civilisations
     * should be rare, with cities and technology): about one star system in six has one.
     */
    const CIV_RATE = { earth: 0.14, ocean: 0.08, desert: 0.06, crystal: 0.07, toxic: 0.04, ice: 0.04, lava: 0.03, gas: 0.02, rock: 0 };

    /** Extra chance of life on a world the first draw left bare (separate stream). */
    const MORE_LIFE = { ice: 0.25, desert: 0.2, crystal: 0.25, toxic: 0.2, gas: 0.2, lava: 0.15, rock: 0.1, ocean: 0.5, earth: 0.5 };

    /** Plants: [chance, fewest kinds, most kinds] (desert salt flats and bare rock mostly grow nothing). */
    const FLORA = { earth: [1, 4, 8], ocean: [1, 3, 6], desert: [0.85, 2, 4], toxic: [1, 3, 6], crystal: [0.7, 2, 5], ice: [0.45, 2, 4], lava: [0.3, 1, 3], gas: [0.35, 2, 3], rock: [0.08, 1, 2] };

    /** How a civilisation builds (Fly Low's cities read civ.style), by the kind of world. */
    const CIV_STYLES = {
        earth: [['spires', 3], ['organic', 2.5], ['arcology', 1.5], ['domes', 1], ['floating', 0.6]],
        ocean: [['floating', 3.5], ['spires', 1.5], ['organic', 1.5], ['domes', 1]],
        desert: [['arcology', 3], ['domes', 2.5], ['spires', 1.5]],
        crystal: [['crystal', 4], ['spires', 1.5], ['floating', 1]],
        toxic: [['domes', 3.5], ['arcology', 2], ['organic', 1]],
        ice: [['domes', 3], ['spires', 2], ['crystal', 1]],
        lava: [['arcology', 2.5], ['domes', 2.5]],
        gas: [['floating', 5]]
    };
    const CIV_STYLE_WORDS = {
        spires: 'cities of tall glass towers', domes: 'cities under great glowing domes', arcology: 'giant cities built like mountains',
        floating: 'floating cities', organic: 'cities grown like giant trees', crystal: 'cities of shining crystal'
    };
    const TECH_WORDS = {
        ring: 'a giant ring around the whole planet', elevator: 'a space elevator up to the stars', maglev: 'fast trains on floating rails',
        drones: 'busy little drones', skyships: 'great sky ships', beacons: 'tall light beacons', solar: 'shining solar farms', farms: 'farms in neat patchwork fields'
    };

    /** The rare sights a world can have (each from its own stream; see RARE in the field guide). */
    function rareOf(w, o) {
        const r = U.rng(U.hash('rare', w.seed));
        const type = w.type;
        const roll = {
            rainbow: r(), doublering: r(), glowsea: r(), aurora: r(), ringedmoon: r(), sky: r(), golden: r(), giant: r(),
            pick: r(), hue: r(), tilt: r(), k: r()
        };
        if (o.kind === 'moon') {
            // A moon with rings of its own (kept inside its reach, so nothing changes round it).
            if (roll.ringedmoon < 0.06) {
                w.rare = 'ringedmoon';
                w.rings = { inner: w.radius * 1.55, outer: w.radius * (2.05 + roll.k * 0.25), color: w.palette.high, tilt: (roll.tilt - 0.5) * 0.8 };
            }
        } else if (type === 'gas') {
            if (roll.rainbow < 0.07) w.rare = 'rainbow';
            else if (w.rings && roll.doublering < 0.12) {
                w.rare = 'doublering';
                const R = w.rings;
                // A second, narrower set of rings inside the first, tipped another way.
                w.rings2 = { inner: R.inner * 0.86, outer: R.inner + (R.outer - R.inner) * 0.55, color: U.shiftHex(R.color, 40 + roll.hue * 80, 1.1, 1.05), tilt: R.tilt + (roll.tilt < 0.5 ? -1 : 1) * (0.45 + roll.k * 0.35) };
            }
        }
        if (!w.rare && o.kind !== 'moon' && w.seaLevel >= 0 && (type === 'ocean' || type === 'earth' || type === 'toxic') && roll.glowsea < 0.08) {
            w.rare = 'glowsea';
            w.glowSea = ['#3affd8', '#5ab8ff', '#7aff9a', '#c08aff'][Math.floor(roll.pick * 4)];
        }
        if (!w.rare && o.kind !== 'moon' && w.atmosphere && roll.aurora < 0.06) {
            w.rare = 'aurora';
            const a = [['#5affa0', '#5ad8ff'], ['#ff7ad0', '#8a7aff'], ['#7affd8', '#ffe07a'], ['#a8ff6a', '#ff8ad8']][Math.floor(roll.pick * 4)];
            w.aurora = { color: a[0], color2: a[1] };
        }
        // Fly Low sights.
        if (w.clouds && w.seaLevel >= 0 && (type === 'earth' || type === 'ocean') && roll.sky < 0.12) w.rainbowSky = true;
        if (w.life && w.life.species.length) {
            const n = w.life.species.length;
            if (roll.golden < 0.06) w.goldSeed = w.life.species[Math.floor(roll.hue * n)];
            if (type !== 'gas' && roll.giant < 0.06 && n > 1) {
                let i = Math.floor(roll.k * n);
                if (w.life.species[i] === w.goldSeed) i = (i + 1) % n;
                w.giantSeed = w.life.species[i];
            }
        }
    }

    /**
     * More to discover on every world, drawn from separate random streams after everything else
     * (so a world's name, size, moons, place and first creatures never change): more kinds of
     * animals, kinds of plants, how a civilisation builds and what technology it has, and the
     * rare sights.
     */
    function enrich(w, o) {
        const r = U.rng(U.hash('life-more', w.seed));
        const type = w.type, gas = type === 'gas', moon = o.kind === 'moon';
        const lifeRoll = r();
        if (!w.life && lifeRoll < (MORE_LIFE[type] || 0)) w.life = { species: [U.hash('species', w.seed, 0)] };
        if (w.life) {
            const want = gas || moon ? r.int(2, 4) : r.int(4, 8);
            for (let i = w.life.species.length; i < want; i++) w.life.species.push(U.hash('species', w.seed, i));
        }
        const F = FLORA[type];
        const bare = type === 'desert' && w.terrain.style === 'salt';
        const lush = w.terrain.style === 'jungle' || w.terrain.style === 'forest';
        if (F && !bare && (r.chance(F[0]) || (type === 'crystal' && w.terrain.style === 'forest'))) {
            const n = r.int(F[1], F[2]) + (lush ? 2 : 0);
            const species = [];
            for (let i = 0; i < n; i++) species.push(U.hash('plant', w.seed, i));
            w.flora = { species: species };
        } else w.flora = null;
        if (w.civ) {
            const c = U.rng(U.hash('civ-more', w.seed));
            w.civ.style = c.weighted(CIV_STYLES[type] || CIV_STYLES.earth);
            const tech = [];
            if (c.chance(0.3)) tech.push('ring');
            if (c.chance(0.3)) tech.push('elevator');
            if (c.chance(gas || w.civ.style === 'floating' ? 0 : 0.7)) tech.push('maglev');
            if (c.chance(0.6)) tech.push('drones');
            if (c.chance(0.6)) tech.push('skyships');
            if (c.chance(0.5)) tech.push('beacons');
            if (c.chance(type === 'desert' ? 0.85 : 0.4)) tech.push('solar');
            if (c.chance(type === 'earth' || type === 'ocean' ? 0.7 : 0.2) && !gas) tech.push('farms');
            w.civ.tech = tech;
            w.civ.cities = c.int(3, 9);
        }
        rareOf(w, o);
        return w;
    }

    const MOODS = [['friendly', 35], ['curious', 30], ['grumpy', 20], ['loud', 15]];

    function terrainOf(r, type) {
        return {
            scale: r.range(1.2, 3.4),           // feature size on the globe
            roughness: r.range(0.35, 0.75),
            ridges: type === 'crystal' || type === 'ice' ? r.range(0.4, 0.9) : r.range(0, 0.45),
            craters: type === 'rock' ? r.range(0.5, 1) : type === 'desert' || type === 'ice' ? r.range(0, 0.4) : 0,
            /** Gas giants: how many bands and whether a big storm spot turns in them. */
            bands: r.int(6, 16),
            storm: r.chance(0.45)
        };
    }

    /**
     * One world (planet or moon) from its seed. `o` = { kind, name, type?, radius?, parent? }.
     */
    function world(seed, o) {
        const r = U.rng(U.hash('world', seed));
        const type = o.type || r.weighted(o.kind === 'moon' ? MOON_MIX : PLANET_MIX);
        const T = PLANET_TYPES[type];
        const palettes = T.pal();
        const pal = r.pick(palettes);
        const gas = type === 'gas';
        const radius = o.radius || Math.round(gas ? r.range(26, 44) : o.kind === 'moon' ? r.range(3.5, 7.5) : r.range(8, 18));
        const seaLevel = T.sea > 0 ? U.clamp(T.sea + r.range(-0.15, 0.15), 0.05, 0.9) : -1;
        const cloudCover = r.range(T.clouds[0], T.clouds[1]);
        const hasLife = r.chance(T.life);
        const w = {
            seed: seed,
            kind: o.kind,
            name: o.name,
            type: type,
            label: T.label,
            short: T.short,
            radius: radius,
            palette: { low: pal[0], mid: pal[1], high: pal[2], peak: pal[3], sea: r.pick(T.seaCol), seaGlow: !!T.seaGlow },
            seaLevel: seaLevel,
            terrain: terrainOf(r, type),
            clouds: cloudCover > 0.05 ? { cover: cloudCover, color: type === 'toxic' ? '#d8f0a0' : type === 'lava' ? '#5a4a48' : type === 'desert' ? '#f0dcc0' : '#ffffff' } : null,
            atmosphere: T.atmo ? { color: T.atmo, thickness: gas ? 0.08 : r.range(0.04, 0.1) } : null,
            rings: null,
            tilt: r.range(-0.45, 0.45),
            spin: r.range(0.03, 0.09) * r.sign(),
            gravity: gas ? r.range(1.6, 3.4) : U.clamp(radius / 13 * r.range(0.55, 1.35), 0.08, 2.4),
            dayHours: Math.round(gas ? r.range(8, 16) : r.range(6, 60)),
            temperature: Math.round(r.range(T.temp[0], T.temp[1])),
            life: null,
            civ: null,
            moons: []
        };
        vary(w);
        if (gas && r.chance(0.55)) {
            const k = r.range(1.5, 1.9);
            w.rings = { inner: radius * k, outer: radius * (k + r.range(0.5, 1.2)), color: r.pick([pal[1], pal[3], '#d8c8b0', '#b8c8d8']), tilt: r.range(-0.4, 0.4) };
        } else if (!gas && o.kind !== 'moon' && r.chance(0.08)) {
            w.rings = { inner: radius * 1.6, outer: radius * 2.3, color: pal[2], tilt: r.range(-0.4, 0.4) };
        }
        if (hasLife) {
            const n = r.int(1, gas ? 2 : 4);
            const species = [];
            for (let i = 0; i < n; i++) species.push(U.hash('species', seed, i));
            w.life = { species: species };
            if (o.kind !== 'moon' && r.chance(CIV_RATE[type] || 0)) {
                w.civ = {
                    seed: U.hash('civ', seed),
                    people: creatureName(U.hash('people', seed)) + 's',
                    mood: r.weighted(MOODS),
                    lights: r.pick(['#ffd27a', '#ffe6a8', '#9ad8ff', '#ff9ad8', '#a8ff9a']),
                    /** Do their ships fly up to meet you? */
                    ships: r.int(2, 5)
                };
            }
        }
        return enrich(w, o);
    }

    // --- systems --------------------------------------------------------------------------------

    function sectorSeed(gs, ix, iy, iz) { return U.hash('sector', gs, ix, iy, iz); }

    /** Systems thin out above and below the galaxy's disk but never run out. */
    function density(iy) { return Math.max(0.22, 0.78 * Math.exp(-Math.abs(iy) / 3)); }

    const systemCache = new Map();

    function systemAt(gs, ix, iy, iz) {
        const id = gs + ':' + ix + ',' + iy + ',' + iz;
        if (systemCache.has(id)) return systemCache.get(id);
        const r = U.rng(sectorSeed(gs, ix, iy, iz));
        let sys = null;
        if (r() < density(iy)) sys = makeSystem(gs, ix, iy, iz, r(), id);
        systemCache.set(id, sys);
        if (systemCache.size > 900) systemCache.delete(systemCache.keys().next().value);
        return sys;
    }

    function makeSystem(gs, ix, iy, iz, salt, id) {
        const seed = U.hash('system', gs, ix, iy, iz, Math.floor(salt * 1e6));
        const r = U.rng(seed);
        const J = SECTOR * JITTER;
        const pos = {
            x: (ix + 0.5) * SECTOR + r.range(-J, J),
            y: (iy + 0.5) * SECTOR + r.range(-J, J) * 0.6,
            z: (iz + 0.5) * SECTOR + r.range(-J, J)
        };
        const name = placeName(U.hash('star', seed));
        const kind = r.weighted(SYSTEM_KINDS);
        const stars = [];
        if (kind === 'binary') {
            const a = r.pick(['yellow', 'orange', 'red', 'white', 'blue']);
            const b = r.pick(['red', 'orange', 'white', 'yellow']);
            stars.push(makeStar(r, a, name + ' A'), makeStar(r, b, name + ' B'));
        } else if (kind === 'nebula') {
            stars.push(makeStar(r, r.pick(['blue', 'white', 'yellow']), name));
        } else {
            stars.push(makeStar(r, kind, name));
        }
        const big = stars.reduce((m, s) => Math.max(m, s.radius), 0);
        // Binary stars circle each other at the middle of the system.
        const pairGap = kind === 'binary' ? big * 2.6 : 0;
        const sys = {
            id: id,
            galaxy: gs,
            key: [ix, iy, iz],
            seed: seed,
            name: name,
            kind: kind,
            pos: pos,
            stars: stars,
            pairGap: pairGap,
            /** A nebula cloud around the system, its colours. */
            nebula: kind === 'nebula' ? { a: U.toHex(U.hsl(r.range(0, 360), 0.7, 0.6)), b: U.toHex(U.hsl(r.range(0, 360), 0.7, 0.55)), size: r.range(900, 1300) } : null,
            /** The black hole's glowing disk. */
            disk: kind === 'blackhole' ? { inner: big * 1.35, outer: big * r.range(3.2, 4.5), color: r.pick(['#ffb070', '#ffd090', '#ff8a60', '#c8a0ff']) } : null,
            plane: { x: r.range(-0.18, 0.18), z: r.range(-0.18, 0.18) },
            planets: [],
            radius: 0
        };
        const n = kind === 'blackhole' ? r.int(0, 2) : kind === 'nebula' ? r.int(1, 4) : r.int(2, 7);
        // Everything is spaced by its "reach": how far out its moons and the ship's orbits go,
        // so the ship orbiting one thing never passes through another.
        const starReach = kind === 'blackhole' ? stars[0].radius * 4.5 * 1.45 : kind === 'binary' ? (pairGap + big) * 2.2 + 70 : big * 3 + 60;
        let orbit = starReach + 40, prevReach = 0;
        for (let i = 0; i < n; i++) {
            const pseed = U.hash('planet', seed, i);
            const pname = placeName(U.hash('pname', pseed));
            // Hot inner worlds, cold outer ones, gas giants further out.
            const pr = U.rng(U.hash('pick', pseed));
            let type = null;
            const outer = i / Math.max(1, n - 1);
            if (i === 0 && pr.chance(0.4)) type = pr.pick(['lava', 'desert', 'toxic']);
            else if (outer > 0.6 && pr.chance(0.55)) type = pr.pick(['gas', 'gas', 'ice']);
            const p = world(pseed, { kind: 'planet', name: pname, type: type });
            p.index = i;
            p.system = sys.id;
            p.systemName = name;
            p.galaxy = gs;
            p.id = id + ':p' + i;
            // Moons: none to several; gas giants have the most.
            const mr = U.rng(U.hash('moons', pseed));
            const mcount = p.type === 'gas' ? mr.int(1, 4) : mr.weighted([[0, 4], [1, 4], [2, 2.5], [3, 0.8]]);
            const shipOrbit = Math.max(p.radius * 2.5 + 12, p.rings ? p.rings.outer * 1.25 : 0);
            let mOrbit = 0, last = null;
            for (let m = 0; m < mcount; m++) {
                const mseed = U.hash('moon', pseed, m);
                const moon = world(mseed, { kind: 'moon', name: pname + ' ' + U.roman(m + 1) });
                moon.index = m;
                moon.parent = p.id;
                moon.parentName = pname;
                moon.system = sys.id;
                moon.systemName = name;
                moon.galaxy = gs;
                moon.id = p.id + ':m' + m;
                const reachM = moon.radius * 3.4 + 8;
                mOrbit = !last ? Math.max(shipOrbit + moon.radius + 6, p.radius + reachM + 6)
                    : mOrbit + (last.radius * 3.4 + 8) + reachM + mr.range(2, 10);
                moon.orbit = Math.round(mOrbit);
                moon.phase = mr.range(0, Math.PI * 2);
                moon.speed = (0.05 + mr.range(0, 0.05)) * (mr.chance(0.85) ? 1 : -1);
                moon.incline = mr.range(-0.3, 0.3);
                p.moons.push(moon);
                last = moon;
            }
            p.reach = Math.round(last ? mOrbit + last.radius * 3.4 + 8 : shipOrbit);
            orbit += (i === 0 ? 0 : prevReach + r.range(40, 90)) + p.reach;
            // A system never spills out of its sector: outer planets that would are left out.
            if (orbit + p.reach + 80 > MAX_SYSTEM_RADIUS) break;
            const angle = r.range(0, Math.PI * 2);
            p.orbit = Math.round(orbit);
            p.angle = angle;
            p.pos = planetPos(sys, p.orbit, angle);
            prevReach = p.reach;
            sys.planets.push(p);
        }
        const lastP = sys.planets[sys.planets.length - 1];
        sys.radius = Math.round(lastP ? lastP.orbit + lastP.reach + 80 : starReach + 120);
        // Rare sights (their own stream, so nothing else in the system changes): a comet sweeping
        // through, or a pod of star whales (most often in a glowing nebula).
        const rs = U.rng(U.hash('rare-sys', seed));
        const cr = rs(), wr = rs(), a = rs(), b = rs(), c = rs();
        if (sys.planets.length && cr < 0.08) {
            sys.comet = { seed: U.hash('comet', seed), angle: a * Math.PI * 2, dist: 0.3 + b * 0.35, color: ['#bfe8ff', '#d8f4ff', '#c8ffe8', '#ffe8c8'][Math.floor(c * 4)] };
        }
        if (wr < (kind === 'nebula' ? 0.3 : kind === 'blackhole' ? 0 : 0.05)) {
            sys.whales = { seed: U.hash('whales', seed), count: 3 + Math.floor(b * 3), color: ['#6ad0ff', '#8f9aff', '#6affd0', '#b89aff'][Math.floor(a * 4)] };
        }
        return sys;
    }

    /** A point on a planet's orbit in the system's (slightly tilted) plane. */
    function planetPos(sys, orbit, angle) {
        const x = Math.cos(angle) * orbit, z = Math.sin(angle) * orbit;
        return { x: sys.pos.x + x, y: sys.pos.y + x * sys.plane.x + z * sys.plane.z, z: sys.pos.z + z };
    }

    /**
     * Explore System's shot over a system is drawn a little like a diagram: inner worlds often
     * huddle round the star while big outer ones swing wide, so there each planet's orbit is moved
     * most of the way (80%) to evenly spaced rings out to the last one (the first ring well out from
     * the star, so the star and the first world each have room), keeping their order and their
     * places round the star. Returns { planetId: how many times further out it is drawn } (the last
     * one stays put).
     */
    function surveySpread(sys) {
        const out = {}, P = sys.planets, n = P.length;
        if (!n) return out;
        const R = P[n - 1].orbit;
        P.forEach(function (p, i) { out[p.id] = (0.2 * p.orbit + 0.8 * R * (i + 2) / (n + 1)) / p.orbit; });
        return out;
    }

    /**
     * How much bigger each world is drawn in that shot, where a world a few ship-lengths across
     * would otherwise be a speck: each planet up to eight times (a small star up to 2.5), never so
     * big that it could touch a neighbour, the star or the ship (where it is drawn, and on its way
     * back to where it really is). want = the radius a world should be drawn at, at least.
     * Returns { spread: surveySpread(sys), scale: { star, planetId... } } (all at least 1).
     */
    function surveyLayout(sys, want, shipPos) {
        const spread = surveySpread(sys), scale = {}, P = sys.planets, c = sys.pos;
        const at = p => { const f = spread[p.id] || 1; return { x: c.x + (p.pos.x - c.x) * f, y: c.y + (p.pos.y - c.y) * f, z: c.z + (p.pos.z - c.z) * f }; };
        let starR = 0;
        if (sys.kind === 'blackhole') starR = sys.disk.outer;
        else {
            const big = sys.stars.reduce((m, s) => Math.max(m, s.radius), 0);
            const inner = P.length ? dist(at(P[0]), c) : Infinity;
            let f = U.clamp(want * 0.9 / big, 1, 2.5);
            f = Math.min(f, Math.max(1, inner * 0.3 / (big * 2.1)));         // its bright glow stays clear of the first planet
            if (sys.stars.length > 1) f = Math.min(f, Math.max(1, sys.pairGap * 1.6 / (sys.stars[0].radius + sys.stars[1].radius)));
            scale.star = f;
            starR = (sys.stars.length > 1 ? sys.pairGap * 2 : 0) + big * f * 1.5;
        }
        P.forEach(function (p) {
            const ext = p.rings ? p.rings.outer : p.radius * 1.08, here = at(p);
            let room = (dist(here, c) - starR) * 0.8;
            P.forEach(function (q) { if (q !== p) room = Math.min(room, dist(here, at(q)) * 0.42); });
            if (shipPos) room = Math.min(room, segDist(shipPos, p.pos, here) * 0.8);
            scale[p.id] = Math.max(1, Math.min(U.clamp(want / p.radius, 1, 8), room / ext));
        });
        return { spread: spread, scale: scale };
    }

    /** Distance from point p to the straight line from a to b. */
    function segDist(p, a, b) {
        const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L = abx * abx + aby * aby + abz * abz;
        const t = L > 0 ? U.clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L, 0, 1) : 0;
        return dist(p, { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t });
    }

    /** Where a moon is at time t (seconds), around its planet. */
    function moonPos(planet, moon, t) {
        const a = moon.phase + moon.speed * t;
        const x = Math.cos(a) * moon.orbit, z = Math.sin(a) * moon.orbit;
        return { x: planet.pos.x + x, y: planet.pos.y + z * Math.sin(moon.incline), z: planet.pos.z + z * Math.cos(moon.incline) };
    }

    /** The two stars of a binary circle each other; a single star sits at the middle. */
    function starPos(sys, i, t) {
        if (sys.stars.length < 2) return { x: sys.pos.x, y: sys.pos.y, z: sys.pos.z };
        const a = t * 0.05 + (i ? Math.PI : 0);
        const big = sys.stars[0].radius, small = sys.stars[1].radius;
        const d = sys.pairGap * (i ? big / (big + small) : small / (big + small)) * 2;
        return { x: sys.pos.x + Math.cos(a) * d, y: sys.pos.y, z: sys.pos.z + Math.sin(a) * d };
    }

    function sectorOf(pos) {
        return [Math.floor(pos.x / SECTOR), Math.floor(pos.y / SECTOR), Math.floor(pos.z / SECTOR)];
    }

    /** Every system within `r` sectors of pos (a cube), nearest first. */
    function systemsNear(gs, pos, r) {
        const [cx, cy, cz] = sectorOf(pos);
        const out = [];
        for (let x = cx - r; x <= cx + r; x++)
            for (let y = cy - r; y <= cy + r; y++)
                for (let z = cz - r; z <= cz + r; z++) {
                    const s = systemAt(gs, x, y, z);
                    if (s) out.push(s);
                }
        out.sort((a, b) => dist2(a.pos, pos) - dist2(b.pos, pos));
        return out;
    }

    function dist2(a, b) { const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z; return x * x + y * y + z * z; }
    function dist(a, b) { return Math.sqrt(dist2(a, b)); }

    /**
     * The things in a system the ship can visit, with where they are and how near the
     * ship must come before "Do you want to go here?". Stars first, then planets.
     */
    function objectsOf(sys) {
        const list = [];
        if (sys.kind === 'blackhole') {
            const s = sys.stars[0];
            list.push(starObject(sys, s, 0));
        } else if (sys.kind === 'binary') {
            // The pair counts as one place to visit: the middle of the system.
            list.push({
                id: sys.id + ':s', kind: 'star', name: sys.name, sys: sys, star: sys.stars[0], pair: true,
                radius: sys.pairGap + sys.stars[0].radius, pos: sys.pos,
                trigger: sys.pairGap + sys.stars[0].radius * 3 + 120,
                label: 'a pair of stars, ' + sys.stars[0].label + ' and ' + sys.stars[1].label, short: 'Binary Stars'
            });
        } else {
            list.push(starObject(sys, sys.stars[0], 0));
        }
        sys.planets.forEach(function (p) {
            list.push({ id: p.id, kind: 'planet', name: p.name, sys: sys, world: p, radius: p.radius, pos: p.pos, trigger: p.radius * 4 + 60, label: p.label, short: p.short });
        });
        return list;
    }

    function starObject(sys, s, i) {
        const special = sys.kind === 'nebula' ? 'nebula' : sys.kind === 'blackhole' ? 'blackhole' : null;
        return {
            id: sys.id + ':s' + i, kind: 'star', name: s.name, sys: sys, star: s, special: special,
            radius: s.radius, pos: sys.pos,
            trigger: s.radius * 3.4 + 110,
            label: special === 'nebula' ? s.label + ' inside a glowing nebula' : s.label,
            short: special === 'nebula' ? 'Nebula' : s.short
        };
    }

    /** Find a world (planet or moon) by its id ("<gs>:<x>,<y>,<z>:p2:m1"), for Visit Again. */
    function findById(id) {
        const m = /^(\d+):(-?\d+),(-?\d+),(-?\d+)(?::(s\d*|p(\d+)(?::m(\d+))?))?$/.exec(id || '');
        if (!m) return null;
        const sys = systemAt(+m[1], +m[2], +m[3], +m[4]);
        if (!sys) return null;
        if (!m[5] || m[5][0] === 's') return { sys: sys, planet: null, moon: null };
        const planet = sys.planets[+m[6]];
        if (!planet) return null;
        const moon = m[7] !== undefined ? planet.moons[+m[7]] || null : null;
        return { sys: sys, planet: planet, moon: moon };
    }

    /** A good place to start in a galaxy: a short way out from a system with planets. */
    function startNear(gs, pos) {
        const near = systemsNear(gs, pos || { x: 0, y: 0, z: 0 }, 2).filter(s => s.planets.length >= 2 && s.kind !== 'blackhole');
        const sys = near[0] || systemsNear(gs, pos || { x: 0, y: 0, z: 0 }, 3)[0];
        const r = U.rng(U.hash('start', gs, sys.id));
        const a = r.range(0, Math.PI * 2);
        const d = sys.radius + 700;
        const p = { x: sys.pos.x + Math.cos(a) * d, y: sys.pos.y + r.range(40, 120), z: sys.pos.z + Math.sin(a) * d };
        // Facing the system.
        const yaw = Math.atan2(-(sys.pos.x - p.x), -(sys.pos.z - p.z));
        return { pos: p, yaw: yaw, pitch: 0, system: sys };
    }

    /** A random new galaxy seed (never the one you are in). */
    function newGalaxySeed(current, salt) {
        let s = U.hash('warp', current, salt) % 100000000 + 2;
        if (s === current) s += 1;
        return s;
    }

    // --- words ------------------------------------------------------------------------------------

    function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function tempWords(c) {
        if (c < -150) return 'colder than anything on Earth';
        if (c < -30) return 'freezing cold';
        if (c < 5) return 'chilly';
        if (c < 30) return 'mild, like a nice day';
        if (c < 80) return 'hot';
        if (c < 300) return 'scorching hot';
        return 'hot enough to melt rock';
    }

    /** The rare world sights, by w.rare. */
    const RARE_NAMES = { rainbow: 'Rainbow Giant', doublering: 'Double Rings', glowsea: 'Glowing Seas', aurora: 'Auroras', ringedmoon: 'A Ringed Moon' };

    /** "cities of tall glass towers, fast trains on floating rails and a space elevator up to the stars" */
    function civWords(civ) {
        const parts = [CIV_STYLE_WORDS[civ.style] || 'great cities'];
        const show = ['ring', 'elevator', 'skyships', 'maglev', 'drones', 'beacons', 'solar', 'farms'].filter(t => (civ.tech || []).indexOf(t) >= 0).slice(0, 2);
        show.forEach(t => parts.push(TECH_WORDS[t]));
        if (!show.length) parts.push('space stations and starships');
        return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
    }

    /** "1.3 times Earth's gravity" style facts for the logbook and the scanner. */
    function facts(w) {
        const out = [];
        out.push({ k: 'Gravity', v: U.nice(w.gravity) + ' g', say: 'Gravity is ' + U.nice(w.gravity) + ' times Earth’s' + (w.gravity < 0.4 ? ', so you could jump very high.' : w.gravity > 1.8 ? ', so you would feel very heavy.' : '.') });
        out.push({ k: 'Moons', v: String(w.moons.length), say: w.moons.length ? 'It has ' + U.plural(w.moons.length, 'moon') + '.' : 'It has no moons.' });
        out.push({ k: 'Day', v: w.dayHours + ' h', say: 'A day lasts ' + w.dayHours + ' hours.' });
        out.push({ k: 'Weather', v: tempWords(w.temperature), say: 'It is ' + tempWords(w.temperature) + '.' });
        if (w.rings) out.push({ k: 'Rings', v: 'Yes', say: 'It has rings!' });
        const pl = plants(w);
        if (w.civ) out.push({ k: 'People', v: 'The ' + w.civ.people, say: 'The ' + w.civ.people + ' live here: an advanced civilisation with ' + civWords(w.civ) + '.' });
        if (w.rare) out.push({ k: 'Rare', v: RARE_NAMES[w.rare] || 'Yes', say: '' });
        if (w.life) out.push({ k: 'Wildlife', v: U.plural(w.life.species.length, 'kind') + (pl ? ' + plants' : ''), say: (w.civ ? 'Wild creatures live here too.' : 'Something lives here!') + (pl ? ' And ' + pl + ' grow here.' : '') });
        else if (pl) out.push({ k: 'Plants', v: pl.charAt(0).toUpperCase() + pl.slice(1), say: capFirst(pl) + ' grow here, but no creatures were found.' });
        return out;
    }

    return {
        SECTOR: SECTOR,
        HOME_GALAXY: HOME_GALAXY,
        STAR_TYPES: STAR_TYPES,
        PLANET_TYPES: PLANET_TYPES,
        placeName: placeName,
        rude: rude,
        creatureName: creatureName,
        galaxy: galaxy,
        galaxyPoints: galaxyPoints,
        SCHEMES: SCHEMES,
        galaxyLabel: galaxyLabel,
        systemAt: systemAt,
        systemsNear: systemsNear,
        sectorOf: sectorOf,
        objectsOf: objectsOf,
        world: world,
        moonPos: moonPos,
        starPos: starPos,
        planetPos: planetPos,
        surveySpread: surveySpread,
        surveyLayout: surveyLayout,
        findById: findById,
        startNear: startNear,
        newGalaxySeed: newGalaxySeed,
        facts: facts,
        plants: plants,
        civWords: civWords,
        CIV_STYLE_WORDS: CIV_STYLE_WORDS,
        TECH_WORDS: TECH_WORDS,
        RARE_NAMES: RARE_NAMES,
        CIV_RATE: CIV_RATE,
        STYLES: STYLES,
        tempWords: tempWords,
        dist: dist,
        dist2: dist2
    };
})();
