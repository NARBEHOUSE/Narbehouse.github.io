/**
 * NARBE Build n Ride - pictures without a browser (dev-only, Node + CPU).
 *
 *   node tools/shot.cjs map <route>                 the whole loop from above
 *   node tools/shot.cjs views <route> [--at s]      Bird's Eye, Third Person and Conductor at s
 *   node tools/shot.cjs tour <route>                Third Person at each bridge, tunnel and overpass
 *   node tools/shot.cjs looks <route> [--at s]      every Look step in Conductor and Third Person
 *   node tools/shot.cjs hero                        the hub picture, before tools/hub-image.py titles it
 *   options: --w 640 --h 360 --season summer --quality high --cols 2
 *
 * Writes PNGs to <hub>/tmp/bnr-shots/ (unique names) and prints their paths.
 */
'use strict';
const H = require('./harness.cjs');

const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +arg('w', 640), Hh = +arg('h', 360);

/** Animals (or any props) lined up on a lawn: node tools/shot.cjs animals [kind,kind,...] */
function lineup(kinds) {
    const { BNR, THREE } = H.boot();
    BNR.Geo.init(THREE);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xd8ecff, 0x8a7d5c, 1.35));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.7);
    sun.position.set(-6, 10, 8);
    sc.add(sun, sun.target);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: new THREE.Color('#7cc15a') }));
    sc.add(g);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tiles = [];
    kinds.forEach(function (k) {
        const group = new THREE.Group();
        BNR.Props.layers(k).forEach(l => group.add(new THREE.Mesh(l.geometry, mat)));
        sc.add(group);
        // Frame each prop by its own size.
        const box = new THREE.Box3();
        group.children.forEach(m => { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); });
        const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const rad = Math.max(size.x, size.y, size.z) * 0.5;
        [[2.6, 1.4, 3.4, 'side'], [3.2, 1.6, -1.2, 'behind'], [0.4, 1.2, 3.6, 'front']].forEach(function (v) {
            const cam = new THREE.PerspectiveCamera(40, W / Hh, 0.05, 900);
            const d = rad * 0.62 + 0.2;
            cam.position.set(ctr.x + v[0] * d, ctr.y + v[1] * d * 0.6, ctr.z + v[2] * d);
            cam.lookAt(ctr.x, ctr.y, ctr.z);
            cam.updateMatrixWorld(true);
            const img = H.R.render(THREE, sc, cam, W, Hh, { ss: 2, sky: ['#3a86d8', '#86c4ef', '#dcf0f9'] });
            H.R.text(img, 4, 4, (k + ' ' + v[3]).toUpperCase(), 1, [255, 255, 255]);
            tiles.push(img);
        });
        sc.remove(group);
    });
    return H.save(H.R.sheet(tiles, 3), 'animals');
}

function main() {
    const t0 = Date.now();
    const cmd = a[0], id = a[1] || 'countryside';
    if (cmd === 'animals') {
        const kinds = (a[1] && !a[1].startsWith('--') ? a[1] : 'cowH,cowHg,cowJ,cowR,sheepB,sheepWg,deerB,deerD').split(',');
        console.log('wrote', lineup(kinds), '(' + (Date.now() - t0) + ' ms)');
        return;
    }
    if (cmd === 'hero') {
        // The hub's game-grid picture before tools/hub-image.py adds the title: the train big on the
        // right of the frame on Mountain Pass's second long bridge, sky and hills top left for the title.
        const { THREE } = H.boot();
        const S = H.load('mountainpass', { season: 'summer', quality: 'high', quiet: true });
        const c = S.track().centerline();
        const runs = [];
        for (let i = 0, from = -1; i < c.n; i++) {
            const br = c.struct[i] === 'bridge';
            if (br && from < 0) from = i;
            if (!br && from >= 0) { if (i - from > 18) runs.push(Math.floor((from + i) / 2)); from = -1; }
        }
        S.placeAt(c.s[runs[1]] + 18);
        H.simulate(0.15);
        const p = S.train().position(), f = new THREE.Vector3();
        S.train().forward(f);
        const side = new THREE.Vector3(-f.z, 0, f.x);
        const cam = new THREE.PerspectiveCamera(40, 1280 / 720, 0.3, 2000);
        cam.position.set(p.x + side.x * 26 + f.x * 20, p.y + 5.5, p.z + side.z * 26 + f.z * 20);
        cam.lookAt(p.x - side.x * 2 - f.x * 24, p.y + 4, p.z - side.z * 2 - f.z * 24);
        cam.updateMatrixWorld(true);
        S.sky().update(0, cam.position.x, cam.position.y, cam.position.z);
        const img = H.shot(cam, { w: 1280, h: 720, ss: 3, shadowR: 160, label: '' });
        console.log('wrote', H.save(img, 'hero'), '(' + (Date.now() - t0) + ' ms)');
        return;
    }
    const S = H.load(id, { season: arg('season', 'summer'), quality: arg('quality', 'high') });
    const c = S.track().centerline();
    let file;
    if (cmd === 'map') {
        const img = H.shot(H.mapCamera(W * 2, Hh * 2), { w: W * 2, h: Hh * 2, ss: 1, shadow: false, fog: false, clouds: false, label: id + ' map' });
        file = H.save(img, 'map-' + id);
    } else if (cmd === 'views') {
        const s = +arg('at', 60);
        const tiles = ['bird', 'chase', 'cab'].map(v => H.shot(H.rideCamera(v, s, { w: W, h: Hh }), { w: W, h: Hh, label: v + ' at ' + s }));
        tiles.push(H.shot(H.mapCamera(W, Hh), { w: W, h: Hh, ss: 1, shadow: false, fog: false, clouds: false, label: 'map' }));
        file = H.save(H.R.sheet(tiles, +arg('cols', 2)), 'views-' + id);
    } else if (cmd === 'looks') {
        const s = +arg('at', 60);
        const tiles = [];
        for (let k = 0; k < 4; k++) tiles.push(H.shot(H.rideCamera('cab', s, { w: W, h: Hh, looks: k }), { w: W, h: Hh, label: 'cab look ' + k }));
        for (let k = 0; k < 4; k++) tiles.push(H.shot(H.rideCamera('chase', s, { w: W, h: Hh, looks: k }), { w: W, h: Hh, label: 'chase look ' + k }));
        file = H.save(H.R.sheet(tiles, 4), 'looks-' + id);
    } else if (cmd === 'train') {
        // The train close up from four sides: train <route> [--at s]
        const s = +arg('at', 60);
        S.state.s = s;
        S.train().place(S.sampler(), s, 0);
        const { THREE } = H.boot();
        const loco = S.train().cars[0].obj;
        loco.updateMatrixWorld(true);
        const tiles = [[0, 2.5, 14, 'front'], [11, 4, 2, 'side'], [-10, 7, -14, 'behind'], [6, 9, 9, 'above'], [2.2, 4.2, 0.5, 'cab close'], [0, 3.95, -2.05, 'eye']].map(function (v) {
            const cam = new THREE.PerspectiveCamera(v[3] === 'eye' ? 66 : 45, W / Hh, 0.1, 1400);
            const pos = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(loco.matrixWorld);
            const look = v[3] === 'eye' ? new THREE.Vector3(0, 3.2, 12).applyMatrix4(loco.matrixWorld) : v[3] === 'cab close' ? new THREE.Vector3(0, 3, -2.4).applyMatrix4(loco.matrixWorld) : new THREE.Vector3(0, 2, -4).applyMatrix4(loco.matrixWorld);
            cam.position.copy(pos); cam.lookAt(look); cam.updateMatrixWorld(true);
            return H.shot(cam, { w: W, h: Hh, label: v[3] });
        });
        file = H.save(H.R.sheet(tiles, 3), 'train-' + id);
    } else if (cmd === 'station') {
        // A station with the train standing in it: station <route> [--k 0]
        const { THREE } = H.boot();
        const k = +arg('k', 0);
        const ride = S.ride(), stn = S.stations().list[k];
        ride.standAt(k, 10);
        S.stations().wave(k, 10);
        H.simulate(1.2);
        const f = stn.frame;
        const tiles = [[-26, -9, 7, 'from the track side'], [12, 16, 5, 'platform'], [-4, 30, 16, 'from behind the house'], [8, 3.6, 2.6, 'people close']].map(function (v) {
            const cam = new THREE.PerspectiveCamera(48, W / Hh, 0.2, 1400);
            cam.position.set(f.x + f.ux * v[0] + f.wx * v[1], f.y + v[2], f.z + f.uz * v[0] + f.wz * v[1]);
            cam.lookAt(f.x + f.wx * 3.5, f.y + 1.6, f.z + f.wz * 3.5);
            cam.updateMatrixWorld(true);
            return H.shot(cam, { w: W, h: Hh, label: stn.name + ' ' + v[3] });
        });
        file = H.save(H.R.sheet(tiles, 2), 'station-' + id + '-' + k);
    } else if (cmd === 'thumb') {
        // The route's tile picture, from its own diorama: thumb <route>
        const d = S.diorama(id, 480, 320);
        const pal = d.sky.palette();
        const img = H.R.render(H.boot().THREE, d.scene, d.camera, 480, 320, { ss: 2, sky: [pal.top, pal.mid, pal.horizon] });
        d.dispose();
        file = H.save(img, 'thumb-' + id);
    } else if (cmd === 'events') {
        // Each event, a few seconds after it starts, seen from the train: events <route> [--after 4]
        const ride = S.ride();
        const tiles = [];
        const defs = S.route().events;
        defs.forEach(function (def, i) {
            S.events().clear();
            const c = S.track().centerline();
            const K = H.boot().BNR.Events.info(def.type);
            const lead = def.lead !== undefined ? def.lead : K.lead;
            const sAnchor = c.s[c.startIndex[def.piece]] + S.track().pieces[def.piece].len / 2;
            S.placeAt(sAnchor - lead - 1);
            ride.setSpeed(1);
            ride.v = 9;
            H.simulate(+arg('after', def.type === 'balloons' ? 14 : def.type === 'freight' ? 26 : def.type === 'sheep' ? 9 : 4));
            // Look from just above the loco at the middle of the event's actors (what a rider turning to look would see).
            const { THREE } = H.boot();
            const box = new THREE.Box3();
            S.events().root.updateMatrixWorld(true);
            S.events().root.children.forEach(ch => box.expandByObject(ch));
            const target = box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
            const p = S.train().position().clone();
            const cam = new THREE.PerspectiveCamera(def.type === 'freight' ? 30 : 50, W / Hh, 0.3, 1400);
            cam.position.set(p.x, p.y + 6, p.z);
            if (target) {
                const d = target.clone().sub(cam.position);
                if (d.length() > 60 && def.type !== 'freight') cam.position.add(d.clone().multiplyScalar(1 - 45 / d.length()));
                cam.lookAt(target);
            }
            cam.updateMatrixWorld(true);
            tiles.push(H.shot(cam, { w: W, h: Hh, label: def.type + ' ' + (target ? Math.round(target.distanceTo(p)) + ' away' : 'nothing') + ' (' + S.events().kinds().join(',') + ')' }));
        });
        file = H.save(H.R.sheet(tiles, 3), 'events-' + id);
    } else if (cmd === 'tour') {
        // One stop at the start of each run of bridge or tunnel, and on each overpass.
        const stops = [];
        let prev = c.struct[0];
        for (let i = 1; i < c.n; i++) {
            const st = c.struct[i];
            if (st !== prev && st !== 'ground') stops.push({ s: c.s[i] + (st === 'tunnel' ? 6 : 14), what: st + (c.lift[i] > 0.6 ? ' (overpass)' : '') });
            if (st === 'tunnel' && prev !== 'tunnel') stops.push({ s: c.s[i] - 6, what: 'tunnel mouth' });
            prev = st;
        }
        const tiles = [];
        stops.slice(0, +arg('max', 12)).forEach(o => {
            tiles.push(H.shot(H.rideCamera('chase', o.s, { w: W, h: Hh }), { w: W, h: Hh, label: o.what + ' s ' + Math.round(o.s) }));
            // Bridges from the side too (Look walks the camera round to the right side).
            if (/bridge/.test(o.what)) tiles.push(H.shot(H.rideCamera('chase', o.s - 10, { w: W, h: Hh, looks: 1 }), { w: W, h: Hh, label: o.what + ' side' }));
        });
        file = H.save(H.R.sheet(tiles, +arg('cols', 3)), 'tour-' + id);
    } else {
        console.log('usage: node tools/shot.cjs map|views|looks|tour <route> [--at s]  (see the header of this file)');
        return;
    }
    console.log('wrote', file, '(' + (Date.now() - t0) + ' ms)');
}

main();
