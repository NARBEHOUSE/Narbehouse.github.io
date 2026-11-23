/**
 * NARBE Space Explorer - creature tests (Node only; never a browser).
 *
 *   node tests/creatures.test.cjs [count]
 *
 * Specs: deterministic, every field present and in range, movement that fits the body,
 * gentle words. Models: height = spec.size (within 15%), under the triangle cap,
 * hundreds of animation frames without errors or NaNs, dispose() frees everything.
 * People (spec.people) build as upright figures with clothes; peopleLook is deterministic and
 * shared with NSE.Aliens, whose calls are deterministic and gentle.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.THREE = require(path.join(ROOT, 'vendor', 'three.min.js'));
for (const f of ['util.js', 'universe.js', 'creatures.js', 'aliens.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), { filename: f });
}
const NSE = globalThis.NSE, THREE = globalThis.THREE;
const U = NSE.Util, C = NSE.Creatures;

const COUNT = +process.argv[2] || 60;          // seeds per world type
const TYPES = ['ice', 'ocean', 'earth', 'desert', 'lava', 'crystal', 'toxic', 'gas', 'rock'];
const CAP = { high: 2500, standard: 1700, low: 1400 };
const RUDE_WORDS = ['damn', 'hell', 'crap', 'poop', 'fart', 'butt', 'pee', 'kill', 'dead', 'die', 'blood', 'bite', 'teeth',
    'fang', 'fangs', 'claw', 'claws', 'scary', 'monster', 'eat you', 'stupid', 'ugly', 'fat', 'hate'];

let failures = 0, checks = 0;
function check(cond, msg) { checks++; if (!cond) { failures++; if (failures <= 25) console.log('  FAIL ' + msg); } }

const worlds = {};
for (const t of TYPES) {
    // A real world of this type (its palette), from the universe generator.
    worlds[t] = NSE.Universe.world(U.hash('test-world', t), { kind: t === 'rock' ? 'moon' : 'planet', name: 'Test', type: t });
}

const tally = { body: {}, variant: {}, move: {}, legs: {}, pattern: {}, glow: 0 };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const HEX = /^#[0-9a-f]{6}$/;
const t0 = Date.now();

// --- specs ------------------------------------------------------------------------------------
const specs = [];
for (const t of TYPES) {
    for (let i = 0; i < COUNT; i++) {
        const seed = U.hash('species-test', t, i);
        const w = worlds[t];
        const a = C.spec(seed, w), b = C.spec(seed, w);
        let same = true;
        try { assert.deepStrictEqual(a, b); } catch (e) { same = false; }
        check(same, 'spec not deterministic for seed ' + seed + ' on ' + t);
        const s = a, id = t + '#' + seed + ' (' + s.body + '/' + s.move + ')';

        check(s.seed === seed, id + ' seed');
        check(s.name === NSE.Universe.creatureName(seed), id + ' name');
        check(C.BODIES.includes(s.body), id + ' body ' + s.body);
        check(C.MOVES.includes(s.move), id + ' move ' + s.move);
        check(Number.isInteger(s.legs) && s.legs >= 0 && s.legs <= 8, id + ' legs ' + s.legs);
        check(['stick', 'stubby', 'tentacle'].includes(s.legKind), id + ' legKind');
        check(Number.isInteger(s.eyes) && s.eyes >= 1 && s.eyes <= 7, id + ' eyes');
        check(Number.isInteger(s.antennae) && s.antennae >= 0 && s.antennae <= 3, id + ' antennae');
        for (const k of ['eyeStalks', 'ears', 'tail', 'wings', 'glow']) check(typeof s[k] === 'boolean', id + ' ' + k + ' boolean');
        for (const k of ['main', 'belly', 'accent', 'eye']) check(HEX.test(s.colors[k]), id + ' colour ' + k + ' ' + s.colors[k]);
        check(C.PATTERNS.includes(s.pattern), id + ' pattern ' + s.pattern);
        check(typeof s.variant === 'string' && s.variant.length > 2, id + ' variant');
        for (const k of ['iris', 'dark']) check(HEX.test(s.colors[k]), id + ' colour ' + k + ' ' + s.colors[k]);
        check(s.size >= 0.3 && s.size <= 6, id + ' size ' + s.size);
        for (const k of ['sizeWords', 'moveWords', 'fact', 'sound']) check(typeof s[k] === 'string' && s[k].length > 3, id + ' ' + k);
        check(/^about as (big|tall) as an? /.test(s.sizeWords), id + ' sizeWords "' + s.sizeWords + '"');
        check(/^It goes ".+"[a-z ]*\.$/.test(s.sound), id + ' sound "' + s.sound + '"');
        check(s.pace > 0 && s.pace < 5, id + ' pace');

        // Movement fits the body.
        if (s.legs === 0) check(s.move !== 'walk', id + ' walks with no legs');
        if (s.move === 'walk') check(s.legs >= 2 && s.legKind !== 'tentacle', id + ' walk needs legs');
        if (s.move === 'roll') check(s.body === 'shell' && s.legs === 0, id + ' roll needs a shell to curl up in');
        if (s.move === 'slither') check(s.body === 'worm' && s.legs === 0, id + ' slither needs a worm');
        if (s.move === 'crawl') check(s.legs >= 4 || (s.legs === 0 && (s.body === 'flat' || s.body === 'shell')), id + ' crawl');
        if (s.body === 'flyer') check(s.wings, id + ' a flyer has wings');
        if (s.move === 'hop') check(s.legs === 0 || (s.legs === 2 && s.legKind !== 'tentacle'), id + ' hop legs');
        if (s.move === 'float' || s.move === 'drift') check(s.legs === 0 || s.legKind === 'tentacle', id + ' floater with walking legs');
        if (s.body === 'jelly') check(s.move === 'float' || s.move === 'drift', id + ' jelly must float');
        if (t === 'gas') check((s.move === 'float' || s.move === 'drift') && (s.legs === 0 || s.legKind === 'tentacle'), id + ' gas giant creature must float, no legs');
        if (t === 'rock') check(s.size <= 1.2, id + ' rock moon creatures are small');
        if (s.glow) check(['lava', 'toxic', 'crystal', 'ocean', 'gas'].includes(t), id + ' glow on ' + t);

        // Gentle words only.
        const text = C.words(s).join(' ').toLowerCase();
        for (const w of RUDE_WORDS) check(!new RegExp('\\b' + w + '\\b').test(text), id + ' unfriendly word "' + w + '": ' + text);

        bump(tally.body, s.body); bump(tally.variant, s.variant); bump(tally.move, s.move); bump(tally.legs, s.legs); bump(tally.pattern, s.pattern);
        if (s.glow) tally.glow++;
        specs.push(s);
    }
}

// The pools are big enough, and a different world type can change the creature.
check(C.FACTS.length >= 30, 'at least 30 facts (' + C.FACTS.length + ')');
check(C.SOUNDS.length >= 20, 'at least 20 sounds (' + C.SOUNDS.length + ')');
for (const b of C.BODIES) check(tally.body[b] > 0, 'body ' + b + ' never chosen');
for (const m of C.MOVES) check(tally.move[m] > 0, 'move ' + m + ' never chosen');
// Without a world it still works.
check(C.spec(7).body && C.spec(7, null).name, 'spec without a world');

// --- people and their calls ---------------------------------------------------------------------
const MOODS = ['friendly', 'curious', 'grumpy', 'loud'];
const peopleSpecs = [];
for (let i = 0; i < 36; i++) {
    const t = TYPES[i % TYPES.length], seed = U.hash('people-test', i);
    let same = true;
    try { assert.deepStrictEqual(C.peopleLook(seed, t), C.peopleLook(seed, t)); } catch (e) { same = false; }
    check(same, 'peopleLook not deterministic for ' + seed);
    const lk = C.peopleLook(seed, t);
    for (const k of ['skin', 'dark', 'belly', 'accent', 'iris', 'outfit', 'trim', 'spots']) check(HEX.test(lk[k]), 'people colour ' + k + ' ' + lk[k]);
    check(lk.eyes >= 1 && lk.eyes <= 4 && (lk.arms === 2 || lk.arms === 4), 'people eyes/arms');
    const ps = C.spec(seed, worlds[t]);
    ps.people = true;
    peopleSpecs.push(ps);
    // The alien call from the same civilisation uses the same look, and says only gentle things.
    const w = Object.assign({}, worlds[t], { civ: { seed: seed, people: 'Testers', mood: MOODS[i % 4], lights: '#ffd27a' } });
    const a = NSE.Aliens.make(w), b = NSE.Aliens.make(w);
    check(a.look && a.look.skin === lk.skin && a.look.head === lk.head && a.look.headgear === lk.headgear, 'alien call look matches the people (' + seed + ')');
    const g1 = a.greeting(), g2 = b.greeting();
    check(g1.alien === g2.alien && g1.translation === g2.translation, 'alien greeting deterministic');
    check(a.voice && a.voice.pitch > 0 && typeof a.draw === 'function', 'alien api');
    const said = (g1.translation + ' ' + a.reply().translation).toLowerCase();
    for (const wd of RUDE_WORDS) check(!new RegExp('\\b' + wd + '\\b').test(said), 'alien line has "' + wd + '": ' + said);
}

// --- models -----------------------------------------------------------------------------------
let built = 0, maxTris = { high: 0, standard: 0, low: 0 }, frames = 0, worst = 0;
const sample = specs.filter((s, i) => i % 2 === 0).concat(peopleSpecs);
sample.forEach(function (s, si) {
    for (const detail of ['high', 'standard', 'low']) {
        if (detail !== 'high' && si % 3) continue;          // high for all, the others for a third
        const id = (s.people ? 'people ' : '') + s.worldType + '#' + s.seed + ' ' + s.body + '/' + s.variant + '/' + s.move + '/' + s.legs + s.legKind[0] + '/e' + s.eyes + ' ' + detail;
        let m;
        try { m = C.build(THREE, s, detail); } catch (e) { check(false, id + ' build threw ' + e.stack); continue; }
        built++;
        check(m.group && m.group.isGroup, id + ' group');
        check(typeof m.update === 'function' && typeof m.dispose === 'function', id + ' api');

        // Height against spec.size (measured afresh, at rest, own height without the hover gap).
        m.group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m.group);
        const h = box.max.y - box.min.y;
        const err = Math.abs(h - s.size) / s.size;
        worst = Math.max(worst, err);
        check(err <= 0.15, id + ' height ' + h.toFixed(2) + ' vs size ' + s.size);
        check(Math.abs(m.height - s.size) / s.size <= 0.15, id + ' reported height');
        check(m.radius > 0 && m.radius < s.size * 4, id + ' radius ' + m.radius);
        check(Math.abs(box.min.y - m.hover) < s.size * 0.12 + 0.02, id + ' feet at the ground / hover (' + box.min.y.toFixed(2) + ' vs ' + m.hover.toFixed(2) + ')');
        check(Math.abs((box.min.x + box.max.x) / 2) < s.size * 0.6 && Math.abs((box.min.z + box.max.z) / 2) < s.size * 0.6, id + ' centred on origin');

        // Triangles and materials.
        let tris = 0, meshes = 0, okMats = true;
        const geos = new Set(), mats = new Set();
        m.group.traverse(o => {
            if (!o.isMesh) return;
            meshes++;
            const g = o.geometry;
            tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
            geos.add(g); mats.add(o.material);
            if (!(o.material.isMeshLambertMaterial || o.material.isMeshBasicMaterial)) okMats = false;
        });
        maxTris[detail] = Math.max(maxTris[detail], tris);
        check(tris <= CAP[detail], id + ' triangles ' + tris + ' > ' + CAP[detail]);
        check(okMats, id + ' only Lambert/Basic materials');
        check(mats.size <= 8, id + ' materials shared (' + mats.size + ')');
        if (s.glow && !s.people) check([...mats].some(mt => mt.emissive && mt.emissiveIntensity > 0.5), id + ' glow has an emissive part');
        if (s.people) check(m.hover === 0, id + ' people stand on the ground');

        // Animate: idle, moving, idle again; the group itself never moves.
        let bad = false;
        const v = new THREE.Vector3();
        for (let f = 0; f < 360; f++) {
            const moving = f >= 60 && f < 260;
            m.update(1 / 60, f / 60, moving);
            frames++;
            if (f % 30 === 0 || f === 359) {
                m.group.updateMatrixWorld(true);
                m.group.traverse(o => {
                    v.setFromMatrixPosition(o.matrixWorld);
                    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) bad = true;
                    if (!Number.isFinite(o.scale.y) || !Number.isFinite(o.quaternion.w)) bad = true;
                });
            }
        }
        // Odd frames: a long pause, zero dt, a huge dt.
        m.update(0, 100, true); m.update(5, 200, false); m.update(undefined, undefined, false);
        m.group.updateMatrixWorld(true);
        m.group.traverse(o => { v.setFromMatrixPosition(o.matrixWorld); if (!Number.isFinite(v.x + v.y + v.z)) bad = true; });
        check(!bad, id + ' NaN after animating');
        check(m.group.position.lengthSq() === 0 && m.group.rotation.y === 0, id + ' update moved the group');
        const bodyChild = m.group.children[0];
        check(bodyChild && bodyChild.position.y >= -0.05 * s.size, id + ' body sank below the ground (' + (bodyChild && bodyChild.position.y) + ')');

        // Same spec builds the same model.
        if (detail === 'high' && built % 5 === 0) {
            const m2 = C.build(THREE, s, 'high');
            let t2 = 0; m2.group.traverse(o => { if (o.isMesh) t2 += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
            check(t2 === tris && Math.abs(m2.height - m.height) < 1e-9, id + ' rebuild differs');
            m2.dispose();
        }

        // Dispose frees every geometry and material.
        let freedG = 0, freedM = 0;
        geos.forEach(g => g.addEventListener('dispose', () => freedG++));
        mats.forEach(mt => mt.addEventListener('dispose', () => freedM++));
        const holder = new THREE.Group(); holder.add(m.group);
        m.dispose();
        check(freedG === geos.size && freedM === mats.size, id + ' dispose freed ' + freedG + '/' + geos.size + ' geometries, ' + freedM + '/' + mats.size + ' materials');
        check(!m.group.parent, id + ' dispose removed the group from its parent');
    }
});

// --- the field guide's kinds, sea creatures, the golden one and the gentle giant ------------------
check(Array.isArray(C.KINDS) && C.KINDS.length >= 30, 'at least 30 kinds of animal (' + (C.KINDS || []).length + ')');
const kindIds = (C.KINDS || []).map(k => k.id);
check(new Set(kindIds).size === kindIds.length && C.KINDS.every(k => k.name && k.hint), 'kinds unique, named, hinted');
for (const v of Object.keys(tally.variant)) check(kindIds.includes(v), 'variant ' + v + ' is in KINDS');
for (const k of kindIds) {
    const ex = C.example(k);
    check(ex && ex.variant === k && C.example(k) === ex, 'example(' + k + ')');
    if (!ex) continue;
    const m = C.build(THREE, ex, 'tiny');
    check(m.triangles <= 900 && Math.abs(m.height - ex.size) / ex.size <= 0.15, k + ' tiny herd copy: ' + m.triangles + ' triangles, height ' + m.height.toFixed(2));
    m.dispose();
}
// Sea creatures only where there is a sea; land creatures keep their look (the sea choice is its own stream).
{
    const dry = Object.assign({}, worlds.ocean, { seaLevel: -1 });
    let swimmers = 0;
    for (let i = 0; i < 200; i++) {
        const seed = U.hash('sea-test', i);
        const wet = C.spec(seed, worlds.ocean), d = C.spec(seed, dry);
        check(d.body !== 'swimmer', 'a swimmer on a world without a sea');
        if (wet.body === 'swimmer') { swimmers++; check(wet.move === 'swim' && wet.legs === 0 && wet.habitat === 'sea', 'swimmer fields'); }
        else check(JSON.stringify(wet) === JSON.stringify(d), 'a land creature changed because the world has a sea (' + seed + ')');
    }
    check(swimmers > 40 && swimmers < 140, 'about a third to a half of ocean species swim (' + swimmers + ' of 200)');
}
{
    const w = Object.assign({}, worlds.earth, { life: { species: [101, 202, 303] }, goldSeed: 202, giantSeed: 303 });
    const g = C.spec(202, w), gi = C.spec(303, w), plain = C.spec(101, w);
    check(g.golden && g.name === 'Golden ' + NSE.Universe.creatureName(202) && g.colors.main === '#e8b52e' && g.glow, 'golden creature (' + g.name + ')');
    check(gi.giant && gi.name === 'Giant ' + NSE.Universe.creatureName(303) && gi.size >= 3.5 && gi.size <= 12 && /house|elephant|car/.test(gi.sizeWords), 'gentle giant (' + gi.name + ', ' + gi.size + ' m, ' + gi.sizeWords + ')');
    check(!plain.golden && !plain.giant, 'other species stay ordinary');
    for (const s of [g, gi]) {
        const m = C.build(THREE, s, 'high');
        check(Math.abs(m.height - s.size) / s.size <= 0.15, s.name + ' builds at its size (' + m.height.toFixed(2) + ' vs ' + s.size + ')');
        m.dispose();
    }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('Creatures: ' + specs.length + ' specs over ' + TYPES.length + ' world types, ' + built + ' models built, ' + frames + ' animation frames (' + secs + ' s)');
console.log('  bodies   ' + JSON.stringify(tally.body));
console.log('  variants ' + JSON.stringify(tally.variant));
console.log('  moves    ' + JSON.stringify(tally.move));
console.log('  legs     ' + JSON.stringify(tally.legs));
console.log('  patterns ' + JSON.stringify(tally.pattern) + ', glowing ' + tally.glow);
console.log('  max triangles high/standard/low: ' + maxTris.high + ' / ' + maxTris.standard + ' / ' + maxTris.low + ', worst height error ' + (worst * 100).toFixed(1) + '%');
const ex = specs[3];
console.log('  e.g. ' + C.words(ex).join(' '));
console.log(failures ? 'FAILED: ' + failures + ' of ' + checks + ' checks' : 'OK: all ' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
