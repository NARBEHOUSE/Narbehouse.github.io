/**
 * NARBE Space Explorer - plant tests (Node only; never a browser).
 *
 *   node tests/flora.test.cjs [worlds per type]
 *
 * Specs: deterministic, every field present and in range, a world's first species is the kind its
 * words promise (NSE.Universe.plants), the others are different kinds, gentle words with the right
 * article. Every kind in KINDS is reachable from real worlds and has an example. Models: small
 * (triangle cap), the right height, a gentle sway without NaNs, dispose() frees everything.
 * draw() only uses the shape templates Fly Low has.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.THREE = require(path.join(ROOT, 'vendor', 'three.min.js'));
for (const f of ['util.js', 'universe.js', 'flora.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), { filename: f });
const NSE = globalThis.NSE, THREE = globalThis.THREE;
const U = NSE.Util, F = NSE.Flora, UV = NSE.Universe;

const PER = +process.argv[2] || 120;
const TYPES = ['ice', 'ocean', 'earth', 'desert', 'lava', 'crystal', 'toxic', 'gas', 'rock'];
const HEX = /^#[0-9a-f]{6}$/;
const HABITATS = ['land', 'shore', 'wet', 'pond', 'sea', 'reef', 'air'];
const TEMPLATES = ['cone6', 'cyl5', 'cyl8', 'ico0', 'ico1', 'hemi', 'cap', 'octa', 'box'];
const RUDE_WORDS = ['damn', 'hell', 'crap', 'poop', 'fart', 'butt', 'pee', 'kill', 'dead', 'die', 'blood', 'bite', 'teeth', 'poison', 'sting', 'scary', 'monster', 'stupid', 'ugly', 'hate'];
const PROMISE = { ocean: 'palm', desert: 'cactus', toxic: 'mushroom', ice: 'frost-fern', lava: 'fire-flower', gas: 'sky-plant', rock: 'lichen' };

let failures = 0, checks = 0;
function check(cond, msg) { checks++; if (!cond) { failures++; if (failures <= 30) console.log('  FAIL ' + msg); } }

const kindIds = F.KINDS.map(k => k.id);
check(kindIds.length >= 30, 'at least 30 kinds (' + kindIds.length + ')');
check(new Set(kindIds).size === kindIds.length, 'kind ids are unique');
check(F.KINDS.every(k => k.name && k.hint && k.hint.length > 8), 'every kind has a name and a hint');

const tally = {};
let worlds = 0, species = 0;
for (const t of TYPES) {
    for (let i = 0; i < PER; i++) {
        const kind = t === 'rock' ? 'moon' : 'planet';
        const w = UV.world(U.hash('flora-test', t, i), { kind: kind, name: 'Test', type: t });
        const words = UV.plants(w);
        if (!w.flora) { check(words === null, t + '#' + i + ' no flora but words "' + words + '"'); continue; }
        worlds++;
        check(typeof words === 'string' && words.length > 3, t + '#' + i + ' flora but no words');
        const kinds = F.kindsOf(w);
        check(kinds.length === w.flora.species.length, t + '#' + i + ' a kind for every species');
        const first = PROMISE[t] || (t === 'crystal' ? (w.terrain.style === 'forest' ? 'crystal-tree' : 'crystal-flower')
            : w.terrain.style === 'jungle' ? 'jungle-tree' : w.terrain.style === 'meadow' ? 'grass' : w.terrain.style === 'mountains' ? 'pine' : 'tree');
        check(kinds[0] === first, t + '#' + i + ' (' + w.terrain.style + ') first species is a ' + first + ', not ' + kinds[0] + ' ("' + words + '")');
        const distinct = new Set(kinds).size;
        check(distinct >= Math.min(kinds.length, 2), t + '#' + i + ' species are different kinds (' + kinds.join(', ') + ')');
        w.flora.species.forEach(function (seed, j) {
            const a = F.spec(seed, w), b = F.spec(seed, w);
            let same = true;
            try { assert.deepStrictEqual(a, b); } catch (e) { same = false; }
            check(same, t + '#' + i + ' spec not deterministic');
            const s = a, id = t + '#' + i + ':' + s.kind;
            check(s.kind === kinds[j], id + ' kind matches kindsOf');
            check(kindIds.includes(s.kind), id + ' known kind');
            const K = F.kind(s.kind);
            check(s.size >= K.size[0] - 1e-9 && s.size <= K.size[1] + 1e-9, id + ' size ' + s.size);
            check(HABITATS.includes(s.habitat), id + ' habitat ' + s.habitat);
            check(s.name.endsWith(' ' + K.word) && /^[A-Z][a-z]+ /.test(s.name) && !UV.rude(s.name.split(' ')[0]), id + ' name "' + s.name + '"');
            for (const k of ['stem', 'leaf', 'leafD', 'leaf2', 'bloom', 'bloom2']) check(HEX.test(s.colors[k]), id + ' colour ' + k + ' ' + s.colors[k]);
            check(s.abundance > 0.5 && s.abundance < 1.5, id + ' abundance');
            const text = F.words(s);
            check(text.length === 4 && text.every(l => typeof l === 'string' && l.length > 6), id + ' four lines of words');
            check(/^This is (a|an) /.test(text[0]) && (/^This is an /.test(text[0]) === /^[AEIOU]/.test(s.name)), id + ' article: ' + text[0]);
            const all = text.join(' ').toLowerCase();
            for (const wd of RUDE_WORDS) check(!new RegExp('\\b' + wd + '\\b').test(all), id + ' unfriendly word "' + wd + '": ' + all);
            tally[s.kind] = (tally[s.kind] || 0) + 1;
            species++;
        });
    }
}
for (const k of kindIds) check(tally[k] > 0, 'kind ' + k + ' is reachable from real worlds');
check(F.spec(7).name && F.spec(7, null).kind, 'spec without a world');

// --- examples, models and drawing ---------------------------------------------------------------
const CAP = 520;
let built = 0, maxTris = 0;
for (const k of kindIds) {
    const ex = F.example(k), ex2 = F.example(k);
    check(ex && ex.kind === k && ex === ex2, 'example(' + k + ')');
    if (!ex) continue;
    // draw(): only Fly Low's templates, finite matrices, a sensible top and radius.
    let okTpl = true, finite = true, parts = 0;
    const res = F.draw(THREE, ex, 10, 2, -5, 0.7, ex.size, function (tpl, e, c0, c1, glow) {
        parts++;
        if (!TEMPLATES.includes(tpl)) okTpl = false;
        for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) finite = false;
        if (!(c0.length === 3 && c1.length === 3 && c0.every(Number.isFinite) && c1.every(Number.isFinite))) finite = false;
        if (typeof glow !== 'boolean') finite = false;
    }, U.rng(5));
    check(okTpl, k + ' draws only Fly Low templates');
    check(finite && parts > 0, k + ' draws finite parts (' + parts + ')');
    check(res && Number.isFinite(res.top) && res.top > 0 && res.top < ex.size * 2 + 1 && res.r > 0, k + ' draw returns top ' + (res && res.top) + ' and radius');
    for (const detail of ['high', 'low']) {
        let m;
        try { m = F.build(THREE, ex, detail); } catch (e) { check(false, k + ' build threw ' + e.stack); continue; }
        built++;
        check(m.group && m.group.isGroup && typeof m.update === 'function' && typeof m.dispose === 'function', k + ' api');
        check(m.triangles > 0 && m.triangles <= CAP, k + ' triangles ' + m.triangles);
        maxTris = Math.max(maxTris, m.triangles);
        check(m.height > 0.04 && Math.abs(m.height - ex.size) < ex.size * 0.6 + 0.25, k + ' height ' + m.height.toFixed(2) + ' vs size ' + ex.size);
        let bad = false;
        const v = new THREE.Vector3();
        for (let f = 0; f < 120; f++) {
            m.update(1 / 60, f / 60);
            if (f % 30 === 0) { m.group.updateMatrixWorld(true); m.group.traverse(o => { v.setFromMatrixPosition(o.matrixWorld); if (!Number.isFinite(v.x + v.y + v.z)) bad = true; }); }
        }
        check(!bad, k + ' NaN after swaying');
        const geos = new Set(), mats = new Set();
        m.group.traverse(o => { if (o.isMesh) { geos.add(o.geometry); mats.add(o.material); if (!(o.material.isMeshLambertMaterial || o.material.isMeshBasicMaterial)) bad = true; } });
        check(!bad, k + ' only Lambert/Basic materials');
        let fg = 0, fm = 0;
        geos.forEach(g => g.addEventListener('dispose', () => fg++));
        mats.forEach(mt => mt.addEventListener('dispose', () => fm++));
        const holder = new THREE.Group(); holder.add(m.group);
        m.dispose();
        check(fg === geos.size && fm === mats.size && !m.group.parent, k + ' dispose freed everything');
    }
}

console.log('Plants: ' + species + ' species on ' + worlds + ' worlds with plants, ' + built + ' models built (max ' + Math.round(maxTris) + ' triangles)');
console.log('  kinds ' + JSON.stringify(tally));
console.log('  e.g. ' + F.words(F.example('kelp')).join(' '));
console.log(failures ? 'FAILED: ' + failures + ' of ' + checks + ' checks' : 'OK: all ' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
