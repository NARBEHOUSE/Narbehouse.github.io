/**
 * NARBE Build n Bash - every destroyer against every build (Node only, real physics).
 *
 *   node tests/bash.test.cjs                    all builds x all destroyers, chunked and not
 *   node tests/bash.test.cjs house              one build
 *   node tests/bash.test.cjs house wreck        one pair, with detail
 *
 * For each pair it presses Destroy whenever the game would let the player,
 * until the build is all down, and checks:
 *   - it gets there (no stuck destroyer, no stuck state) in sensible time
 *   - every block ends loose (or gone off the edge)
 *   - each destroyer run lasts 1.5 to 6 seconds
 *   - nothing throws
 * It also reports how much rubble stays near the plot (warn if most of it
 * flew out of sight: a knock-down should tumble, not launch).
 */
'use strict';
const H = require('../tools/harness.cjs');

async function main() {
    const { BNB } = await H.bootPhysics();
    const onlyBuild = process.argv[2], onlyBasher = process.argv[3];
    let failures = 0, runs = 0;
    const fail = (m) => { failures++; console.log('  FAIL ' + m); };
    const builds = BNB.Builds.LIST.filter(b => !onlyBuild || b.id === onlyBuild);
    const types = BNB.Bashers.TYPES.filter(t => !onlyBasher || t.id === onlyBasher);
    for (const build of builds) {
        const line = [];
        for (const def of types) {
            const zeroG = (BNB.Worlds.info(build.world) || {}).zeroG;
            if (zeroG && def.ground) continue;
            for (const chunked of [true, false]) {
                runs++;
                const S = H.sim(build.id, { seed: 99 + runs, chunked: chunked });
                S.showFinished();
                let t = 0, presses = 0, bashT = 0, down = false;
                const dt = 1 / 60, errs = [];
                const runsLen = [];
                const origWarn = console.warn;
                console.warn = (...a) => { errs.push(a.map(String).join(' ')); };
                try {
                    while (t < 45) {
                        if (!S.busy() && S.canDestroy()) {
                            if (presses > 0) runsLen.push(bashT);
                            bashT = 0;
                            const info = S.destroy({ type: def.id });
                            if (!info) { fail(build.id + '/' + def.id + ': destroy() refused'); break; }
                            presses++;
                        }
                        S.update(dt);
                        t += dt;
                        if (S.busy()) bashT += dt;
                        if (S.state() === 'down') { down = true; break; }
                    }
                } finally { console.warn = origWarn; }
                runsLen.push(bashT);
                const tag = build.id + '/' + def.id + (chunked ? ' chunked' : ' whole');
                errs.forEach(e => fail(tag + ': ' + e));
                if (!down) fail(tag + ': never all down (state ' + S.state() + ' after ' + t.toFixed(1) + 's)');
                const recs = S.blocks();
                const standing = recs.filter(r => r.state === 'frozen' || r.state === 'flying').length;
                if (standing) fail(tag + ': ' + standing + ' block(s) still standing');
                const expect = BNB.Chunks.presses(build.blocks.length, chunked);
                if (presses > expect) fail(tag + ': took ' + presses + ' presses, expected at most ' + expect);
                runsLen.forEach(len => { if (len > 0 && (len < 1.5 || len > 6.05)) fail(tag + ': a run lasted ' + len.toFixed(2) + 's'); });
                const f = S.frame(), near = recs.filter(r => r.state === 'loose' && r.mesh.position.distanceTo(f.center) < f.radius * 3 + 4).length;
                const keep = near / recs.length;
                if (!zeroG && keep < 0.5) console.log('  warn ' + tag + ': only ' + Math.round(keep * 100) + '% of the rubble stayed near the plot');
                if (onlyBasher) console.log('  ' + tag + ': ' + presses + ' press(es), runs ' + runsLen.map(x => x.toFixed(1)).join('/') + 's, down at ' + t.toFixed(1) + 's, rubble near plot ' + Math.round(keep * 100) + '%');
                line.push(def.id + (chunked ? '' : '*'));
            }
        }
        console.log((failures ? '.. ' : 'ok ') + build.id.padEnd(8) + line.length + ' runs');
    }
    console.log(failures ? '\n' + failures + ' problem(s) in ' + runs + ' runs' : '\nall ' + runs + ' destroyer runs passed');
    process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
