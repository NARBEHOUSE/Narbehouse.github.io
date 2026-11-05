/**
 * NARBE Build n Bash - build data checks (Node only, no browser).
 *
 *   node tests/builds.test.cjs            every build
 *   node tests/builds.test.cjs castle     one build, with its support list
 *
 * Checks press counts, tiers, colours, overlaps, floating blocks and size,
 * and that chunked destruction never leaves a block hanging in the air.
 */
'use strict';
const path = require('node:path');
const H = require('../tools/harness.cjs');

const { BNB } = H.boot({ physics: false });
const only = process.argv[2];
let failures = 0;

const EXPECT = [
    ['house', 7, 1], ['rocket', 8, 1], ['tree', 6, 1], ['train', 16, 2], ['pyramid', 15, 2], ['bridge', 12, 2],
    ['robot', 24, 3], ['pirate', 28, 3], ['city', 30, 3], ['castle', 50, 4], ['park', 50, 4], ['station', 50, 4]
];

function fail(msg) { failures++; console.log('  FAIL ' + msg); }

const present = BNB.Builds.LIST.map(b => b.id);
if (!only) {
    EXPECT.forEach(([id, presses, tier]) => {
        const b = BNB.Builds.get(id);
        if (!b) { console.log('  (missing) ' + id); return; }
        if (b.blocks.length !== presses) fail(id + ' has ' + b.blocks.length + ' blocks, expected ' + presses);
        if (b.tier !== tier) fail(id + ' tier ' + b.tier + ', expected ' + tier);
    });
    // Smallest to biggest.
    const order = EXPECT.map(e => e[0]).filter(id => present.includes(id));
    if (present.join(',') !== order.join(',')) fail('builds are not in the design order: ' + present.join(', '));
}

BNB.Builds.LIST.forEach(function (build) {
    if (only && build.id !== only) return;
    const world = BNB.Worlds && BNB.Worlds.info ? BNB.Worlds.info(build.world) : null;
    if (BNB.Worlds && BNB.Worlds.info && !world) console.log('  (world ' + build.world + ' not registered yet)');
    const t0 = Date.now();
    const r = BNB.Builds.check(build, { zeroG: !!(world && world.zeroG) || !!build.float });
    r.errors.forEach(fail);
    r.warnings.forEach(w => console.log('  warn ' + w));
    const b = r.bounds;
    console.log((r.errors.length ? 'x ' : 'ok ') + build.id.padEnd(8) + String(build.blocks.length).padStart(3) + ' blocks  ' +
        'x ' + b.min[0].toFixed(1) + '..' + b.max[0].toFixed(1) + '  z ' + b.min[2].toFixed(1) + '..' + b.max[2].toFixed(1) +
        '  top ' + b.max[1].toFixed(1) + '  plot r ' + BNB.Builds.plotRadius(build).toFixed(1) + '  (' + (Date.now() - t0) + ' ms)');

    // Chunked destruction: every chunk plan must take dependents with it.
    const rel = BNB.Builds.relations(build.blocks);
    for (let placed = 1; placed <= build.blocks.length; placed += Math.max(1, Math.floor(build.blocks.length / 5))) {
        const plan = BNB.Chunks.plan(build.blocks, placed, { chunked: true, seed: placed });
        const gone = new Set();
        plan.forEach(function (chunk) {
            chunk.ids.forEach(i => gone.add(i));
            for (let i = 0; i < placed; i++) {
                if (gone.has(i)) continue;
                if (rel.on[i].some(j => gone.has(j))) fail(build.id + ' placed ' + placed + ': block #' + (i + 1) + ' left hanging after a chunk');
            }
        });
        if (gone.size !== placed) fail(build.id + ' placed ' + placed + ': chunks cover ' + gone.size);
    }
    if (only) {
        build.blocks.forEach((s, i) => console.log('   #' + (i + 1) + ' ' + s.s + ' ' + s.c + (s.n ? ' "' + s.n + '"' : '') +
            '  on ' + (rel.ground[i] ? 'ground ' : '') + rel.on[i].map(j => '#' + (j + 1)).join(' ')));
        const plan = BNB.Chunks.plan(build.blocks, build.blocks.length, { chunked: true, seed: 1 });
        console.log('   chunks: ' + plan.map(c => '[' + c.ids.length + (c.side < 0 ? ' L' : ' R') + ']').join(' '));
    }
});

console.log(failures ? '\n' + failures + ' problem(s)' : '\nall build checks passed');
process.exit(failures ? 1 : 0);
