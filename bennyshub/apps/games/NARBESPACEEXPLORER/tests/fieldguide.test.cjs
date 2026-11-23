/**
 * NARBE Space Explorer - Field Guide and rare-sight tests (Node only; never a browser).
 *
 *   node tests/fieldguide.test.cjs
 *
 * The guide lists every kind of world, landscape, star, civilisation and rare sight the universe
 * can make (and nothing it can't); finds are remembered once, survive a reload and clear; species
 * are counted once. The universe's richer worlds: rare sights, more life, plants and grander
 * civilisations come from their own random streams, are deterministic, and turn up about as
 * often as intended (civilisations rare, every rare sight findable).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
};
const files = ['util.js', 'universe.js', 'creatures.js'];
if (fs.existsSync(path.join(ROOT, 'js', 'flora.js'))) files.push('flora.js');
files.push('fieldguide.js');
for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), { filename: f });
const NSE = globalThis.NSE, UV = NSE.Universe, G = NSE.Guide, U = NSE.Util;

let failures = 0, checks = 0;
function check(cond, msg) { checks++; if (!cond) { failures++; if (failures <= 30) console.log('  FAIL ' + msg); } }

// --- the guide lists exactly what the universe makes ---------------------------------------------
const cats = G.cats();
const ids = new Set();
cats.forEach(c => c.items.forEach(it => { check(!ids.has(it.id), 'unique id ' + it.id); ids.add(it.id); check(it.name && it.name.length < 26, 'short name ' + it.id + ' "' + it.name + '"'); }));
Object.keys(UV.PLANET_TYPES).forEach(t => check(ids.has('world:' + t), 'world kind listed: ' + t));
Object.keys(UV.STYLES).forEach(t => UV.STYLES[t].forEach(s => check(ids.has('land:' + t + ':' + s), 'landscape listed: ' + t + ':' + s)));
G.LANDS.forEach(l => check((UV.STYLES[l.type] || []).indexOf(l.id.split(':')[2]) >= 0, 'landscape exists in the universe: ' + l.id));
['yellow', 'orange', 'red', 'blue', 'white', 'binary', 'nebula', 'blackhole'].forEach(k => check(ids.has('star:' + k), 'star kind listed: ' + k));
Object.keys(UV.CIV_STYLE_WORDS).forEach(s => check(ids.has('civ:' + s), 'civ style listed: ' + s));
Object.keys(UV.TECH_WORDS).forEach(t => check(ids.has('tech:' + t), 'tech listed: ' + t));
['comet', 'whales', 'rainbowsky', 'golden', 'giant'].concat(Object.keys(UV.RARE_NAMES)).forEach(r => check(ids.has('rare:' + r), 'rare sight listed: ' + r));
if (NSE.Creatures.KINDS) {
    const kinds = new Set(NSE.Creatures.KINDS.map(k => k.id));
    // Every animal kind the guide lists can really be met (example() makes one of it).
    NSE.Creatures.KINDS.forEach(k => { const s = NSE.Creatures.example ? NSE.Creatures.example(k.id) : null; check(!s || s.variant === k.id, 'animal example is its kind: ' + k.id); });
    // And every animal the universe makes is in the guide.
    const seen = new Set();
    for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) {
        const sys = UV.systemAt(5, x, 0, z);
        if (!sys) continue;
        sys.planets.forEach(p => [p].concat(p.moons).forEach(w => (w.life ? w.life.species : []).forEach(sd => seen.add(NSE.Creatures.spec(sd, w).variant))));
    }
    seen.forEach(v => check(kinds.has(v), 'animal kind in the guide: ' + v));
    console.log('animal kinds met near the origin: ' + seen.size + ' of ' + kinds.size);
}
if (NSE.Flora && NSE.Flora.KINDS) {
    const kinds = new Set(NSE.Flora.KINDS.map(k => k.id)), seen = new Set();
    for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) {
        const sys = UV.systemAt(5, x, 0, z);
        if (!sys) continue;
        sys.planets.forEach(p => [p].concat(p.moons).forEach(w => (w.flora ? w.flora.species : []).forEach(sd => seen.add(NSE.Flora.spec(sd, w).kind))));
    }
    seen.forEach(v => check(kinds.has(v), 'plant kind in the guide: ' + v));
    console.log('plant kinds met near the origin: ' + seen.size + ' of ' + kinds.size);
}

// --- finding things -------------------------------------------------------------------------------
G.clear();
const s0 = G.stats();
check(s0.found === 0 && s0.total === ids.size, 'a fresh guide is empty (' + s0.total + ' to find)');
check(G.find('world:ice', { id: '1:0,0,0:p0', name: 'Velara', galaxyName: 'Galridus' }, { pal: { mid: '#123456' } }) === true, 'a first find is new');
check(G.find('world:ice', null, null) === false, 'the same find twice is not new');
check(G.find('world:nonsense') === false, 'an unknown id is never stored');
check(G.has('world:ice') && G.get('world:ice').where.name === 'Velara', 'a find remembers where');
check(G.species('animals', 12345) === true && G.species('animals', 12345) === false && G.species('plants', 12345) === true, 'species are counted once per kind');
check(G.stats().found === 1 && G.stats().animals === 1 && G.stats().plants === 1, 'stats count finds and species');
G._reload();
check(G.has('world:ice') && G.stats().animals === 1, 'the guide survives a reload');
const worldsCat = cats.find(c => c.id === 'worlds');
check(G.count(worldsCat) === 1, 'a section counts its finds');
G.clear();
check(G.stats().found === 0 && !G.has('world:ice') && !store['nse-guide-v1'], 'clear() empties it');

// --- the richer universe ----------------------------------------------------------------------------
let sys = 0, civSys = 0, comets = 0, whales = 0, planets = 0, moons = 0, life = 0, species = 0, flora = 0;
const rare = {}, extra = { rainbowSky: 0, gold: 0, giant: 0 }, styles = {}, tech = {};
for (let x = -14; x < 14; x++) for (let z = -14; z < 14; z++) {
    const s = UV.systemAt(9, x, 0, z);
    if (!s) continue;
    sys++;
    if (s.comet) comets++;
    if (s.whales) whales++;
    let civ = false;
    s.planets.forEach(p => {
        planets++;
        [p].concat(p.moons).forEach(w => {
            if (w.kind === 'moon') moons++;
            if (w.life) { life++; species += w.life.species.length; check(w.life.species.length >= 1 && w.life.species.length <= 8, 'species count in range: ' + w.name); }
            if (w.flora) { flora++; check(w.flora.species.length >= 1 && w.flora.species.length <= 10, 'plant count in range: ' + w.name); }
            check(!!w.flora === !!UV.plants(w), 'plants() words match flora: ' + w.name);
            if (w.civ) {
                civ = true;
                check(w.kind === 'planet' && !!UV.CIV_STYLE_WORDS[w.civ.style] && Array.isArray(w.civ.tech), 'civ has a style and tech: ' + w.name);
                styles[w.civ.style] = (styles[w.civ.style] || 0) + 1;
                w.civ.tech.forEach(t => { tech[t] = (tech[t] || 0) + 1; check(!!UV.TECH_WORDS[t], 'known tech ' + t); });
                check(/advanced civilisation with .+/.test(UV.facts(w).find(f => f.k === 'People').say), 'civ words: ' + w.name);
            }
            if (w.rare) {
                rare[w.rare] = (rare[w.rare] || 0) + 1;
                if (w.rare === 'doublering') check(w.rings && w.rings2 && w.rings2.outer <= w.rings.outer, 'double rings sit inside the first: ' + w.name);
                if (w.rare === 'ringedmoon') check(w.kind === 'moon' && w.rings && w.rings.outer < w.radius * 3.4 + 8, 'a ringed moon keeps its rings inside its reach: ' + w.name);
                if (w.rare === 'glowsea') check(/^#[0-9a-f]{6}$/i.test(w.glowSea) && w.seaLevel >= 0, 'glowing seas have a colour and seas: ' + w.name);
                if (w.rare === 'aurora') check(w.aurora && w.atmosphere, 'auroras need air: ' + w.name);
                if (w.rare === 'rainbow') check(w.type === 'gas', 'rainbow giants are gas giants: ' + w.name);
                check(UV.facts(w).some(f => f.k === 'Rare'), 'a rare world says so in its facts: ' + w.name);
            }
            if (w.rainbowSky) { extra.rainbowSky++; check(w.clouds && w.seaLevel >= 0, 'a rainbow needs seas and clouds: ' + w.name); }
            if (w.goldSeed) { extra.gold++; check(w.life.species.indexOf(w.goldSeed) >= 0, 'the golden one is one of its species: ' + w.name); }
            if (w.giantSeed) { extra.giant++; check(w.life.species.indexOf(w.giantSeed) >= 0 && w.giantSeed !== w.goldSeed, 'the giant is another of its species: ' + w.name); }
        });
    });
    if (civ) civSys++;
}
const civShare = civSys / sys;
console.log('systems ' + sys + ': civilisations in ' + (civShare * 100).toFixed(1) + '%, comets ' + comets + ', whale pods ' + whales + ', life on ' + life + ' worlds (' + (species / life).toFixed(1) + ' kinds each), plants on ' + flora);
console.log('rare worlds ' + JSON.stringify(rare) + ' ' + JSON.stringify(extra));
console.log('civ styles ' + JSON.stringify(styles) + ' tech ' + JSON.stringify(tech));
check(civShare > 0.04 && civShare < 0.25, 'civilisations are rare but findable (' + (civShare * 100).toFixed(1) + '% of systems)');
check(comets > 0 && whales > 0, 'comets and star whales exist');
Object.keys(UV.RARE_NAMES).forEach(k => check((rare[k] || 0) > 0, 'rare world sight turns up: ' + k));
check(extra.rainbowSky > 0 && extra.gold > 0 && extra.giant > 0, 'Fly Low rare sights turn up');
// Deterministic: the same seed always makes the same rare sights, life, plants and civilisations
// (two fresh worlds from one seed; systemAt would hand back its cached copy).
let same = true;
for (let i = 0; i < 400; i++) {
    const kind = i % 3 ? 'planet' : 'moon', seed = U.hash('det', i);
    const x = JSON.stringify(UV.world(seed, { kind: kind, name: 'A' })), y = JSON.stringify(UV.world(seed, { kind: kind, name: 'A' }));
    if (x !== y) { same = false; break; }
}
check(same, 'rich worlds are deterministic');

console.log((failures ? 'FAILED ' + failures : 'ok') + ' ' + (checks - failures) + '/' + checks + ' checks');
process.exit(failures ? 1 : 0);
