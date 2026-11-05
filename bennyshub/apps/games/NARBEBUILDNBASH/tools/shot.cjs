/**
 * NARBE Build n Bash - pictures without a browser (dev-only, Node + CPU).
 *
 *   node tools/shot.cjs build <id>            the build going up, in its world (6 stages)
 *   node tools/shot.cjs world <id>            the finished build from the game camera + two wide views
 *   node tools/shot.cjs bash <id> <basher>    frames of one destroyer knocking down the whole build
 *            [--chunk]                        ...or just the first chunk (chunked destruction)
 *   node tools/shot.cjs all                   every finished build, as the Build Select tiles
 *   node tools/shot.cjs bashers <id>          every destroyer's best frame against one build
 *   options: --w 400 --h 300 --cols 3 --seed 7
 *
 * Writes PNGs to <hub>/tmp/bnb-shots/ (unique names) and prints their paths.
 */
'use strict';
const H = require('./harness.cjs');

const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const flag = (k) => a.includes('--' + k);
const W = +arg('w', 400), Hh = +arg('h', 300), SEED = +arg('seed', 7);

async function main() {
    const t0 = Date.now();
    const cmd = a[0];
    let file;
    if (cmd === 'build') {
        await H.bootPhysics();
        const S = H.sim(a[1], { seed: SEED });
        const n = S.total(), stops = [0, 1, 2, 3, 4, 5].map(k => Math.round(k / 5 * n));
        const tiles = [];
        stops.forEach(k => {
            while (S.placed() < k) S.addBlock({ instant: true });
            tiles.push(H.shot(S, { w: W, h: Hh, label: a[1] + ' ' + k + '/' + n }));
        });
        file = H.save(H.R.sheet(tiles, +arg('cols', 3)), 'build-' + a[1]);
    } else if (cmd === 'world') {
        await H.bootPhysics();
        const S = H.sim(a[1], { seed: SEED });
        S.showFinished();
        H.run(S, 0.5);
        const tiles = [
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: a[1] + ' game camera' }),
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: 'wide', view: { dist: 2.6, el: 10 } }),
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: 'side', view: { az: 70, dist: 1.8 } }),
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: 'menu orbit', view: { az: 22, dist: 1.25 } })
        ];
        file = H.save(H.R.sheet(tiles, 2), 'world-' + a[1]);
    } else if (cmd === 'scene') {
        // A world on its own, with a stand-in build: scene <worldId> [--build pyramid] [--empty]
        await H.bootPhysics();
        const S = H.sim(arg('build', 'pyramid'), { seed: SEED, world: a[1] });
        if (!flag('empty')) S.showFinished();
        H.run(S, 0.5);
        const tiles = [
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: a[1] + ' game camera' }),
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: 'wide', view: { dist: 2.6, el: 8 } }),
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: 'left', view: { az: -60, dist: 1.6 } }),
            H.shot(S, { w: W * 1.5, h: Hh * 1.5, label: 'right', view: { az: 40, dist: 1.4 } })
        ];
        file = H.save(H.R.sheet(tiles, 2), 'scene-' + a[1]);
    } else if (cmd === 'bash') {
        await H.bootPhysics();
        const S = H.sim(a[1], { seed: SEED, chunked: flag('chunk') });
        S.showFinished();
        H.run(S, 0.2);
        const info = S.destroy({ type: a[2] });
        if (!info) throw new Error('could not start ' + a[2]);
        const tiles = [];
        const frames = +arg('frames', 9), dt = 1 / 60;
        let t = 0;
        const total = +arg('secs', 5.5);
        for (let f = 0; f < frames; f++) {
            const until = (f + 1) / frames * total;
            while (t < until) { S.update(dt); t += dt; }
            tiles.push(H.shot(S, { w: W, h: Hh, label: a[2] + ' ' + t.toFixed(1) + 's ' + S.state() }));
        }
        const loose = S.blocks().filter(r => r.state === 'loose' || r.state === 'gone').length;
        console.log('loose/gone blocks after', total + 's:', loose, 'of', S.placed(), ' state', S.state());
        file = H.save(H.R.sheet(tiles, +arg('cols', 3)), 'bash-' + a[1] + '-' + a[2]);
    } else if (cmd === 'bashers') {
        await H.bootPhysics();
        const { BNB } = H.boot();
        const tiles = [];
        for (const def of BNB.Bashers.TYPES) {
            const S = H.sim(a[1], { seed: SEED, chunked: false });
            S.showFinished();
            S.destroy({ type: def.id });
            let t = 0;
            const at = +arg('at', 1.4);
            while (t < at) { S.update(1 / 60); t += 1 / 60; }
            tiles.push(H.shot(S, { w: W, h: Hh, label: def.id + ' ' + at + 's' }));
        }
        file = H.save(H.R.sheet(tiles, +arg('cols', 4)), 'bashers-' + a[1]);
    } else if (cmd === 'hero') {
        // The hub picture: hero <build> <basher> --at 1.2 [--w 1280 --h 720] [--az 0 --dist 1 --el 0] [--out file]
        await H.bootPhysics();
        const S = H.sim(a[1], { seed: SEED, chunked: false });
        S.showFinished();
        H.run(S, 0.3);
        if (a[2] && a[2] !== 'none') S.destroy({ type: a[2] });
        H.run(S, +arg('at', 1.2));
        const img = H.shot(S, { w: +arg('w', 1280), h: +arg('h', 720), ss: +arg('ss', 2),
            view: { az: +arg('az', 0), el: +arg('el', 0), dist: +arg('dist', 1), shiftX: +arg('shift', 0.14), shiftY: +arg('shifty', 0) } });
        if (arg('out')) { H.R.writePNG(arg('out'), img); file = arg('out'); }
        else file = H.save(img, 'hero-' + a[1] + '-' + a[2]);
    } else if (cmd === 'all') {
        await H.bootPhysics();
        const { BNB } = H.boot();
        const tiles = BNB.Builds.LIST.map(b => {
            const S = H.sim(b.id, { seed: SEED });
            S.showFinished();
            H.run(S, 0.2);
            return H.shot(S, { w: W, h: Hh, label: b.name + ' ' + b.blocks.length });
        });
        file = H.save(H.R.sheet(tiles, +arg('cols', 4)), 'all-builds');
    } else {
        console.log('usage: node tools/shot.cjs build|world|bash|bashers|all ...  (see the header of this file)');
        return;
    }
    console.log('wrote', file, '(' + (Date.now() - t0) + ' ms)');
}

main().catch(e => { console.error(e); process.exit(1); });
