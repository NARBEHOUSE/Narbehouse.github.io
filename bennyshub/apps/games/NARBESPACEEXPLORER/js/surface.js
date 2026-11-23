/**
 * NARBE Space Explorer - Fly Low: a calm skim over a world's surface.
 *
 *   const s = NSE.Surface.create(THREE, world, { ship, detail, skyPlanet, starColor });
 *   s.scene                  its own THREE.Scene (lights, fog, sky)
 *   s.update(dt, t)          advance the flight and animate everything
 *   s.setView(view, camera)  'cockpit' | 'chase' | 'wide', every frame after update (eased)
 *   s.steer(dir)             +1 = turn left, -1 = turn right: one press = one ~30 degree turn,
 *                            eased over ~1.5 s (presses add up). Returns true.
 *   s.heading()              the flight heading in radians (0 = toward -Z, + = turned left)
 *   s.nearestCreature()      { spec, index, distance, position } or null (leaders and herd members)
 *   s.species()              the species specs living here ([] when none)
 *   s.plants()               what grows here, same words as NSE.Universe.plants(world), or null
 *   s.flora()                the plant species drawn here (NSE.Flora specs, [] when none)
 *   s.nearestPlant()         { spec, index, distance, position } or null
 *   s.seen()                 { rainbow, golden, giant }: each true once it has been in view near the ship
 *   s.style                  the terrain style drawn (world.terrain.style, checked)
 *   s.setSpeed(k)            0.5..2 (default 1)
 *   s.setQuality(detail)     'high' | 'standard' | 'low' (rebuilds the streamed parts)
 *   s.heightAt(x, z)         ground height (terrain, or sea/lava/cloud deck where higher)
 *   s.stats()                { chunks, geometries, triangles, creatures, ... } for tests
 *   s.sky                    { top, mid, horizon } hex colours of the sky dome
 *   s.bank, s.pitch          the ship's current lean (radians), already applied to `ship`
 *   s.dispose()              frees everything it made (never the ship)
 *
 * 1 unit = 1 metre. The ship flies forward at ~18 m/s along its heading, which eases toward
 * a target heading (changed by steer) plus a gentle seeded wander. It stays 8-14 m above the
 * ground and above anything tall (trees, spires, towers): it looks ahead along its curving
 * course and climbs early, and never goes below ground + 5 m. Ground is streamed in square
 * chunks around the ship (more ahead than behind): one merged, vertex-coloured, flat-shaded
 * mesh per chunk for terrain + solid features, and one unlit mesh for glowing bits. Chunks
 * left behind are disposed. Only Mesh / InstancedMesh / Points with Lambert, Basic or
 * Standard materials, so the hub's CPU test renderer can draw it.
 *
 * Every world type comes in styles (world.terrain.style, see NSE.Universe.STYLES) with their
 * own landforms, features and density; plants are drawn exactly when NSE.Universe.plants
 * says something grows. Calm by design: no flashing, no shake, slow pulses only.
 * Plain browser script; also loads in Node (no DOM touched at load time).
 */

window.NSE = window.NSE || {};

NSE.Surface = (function () {
    'use strict';

    const U = NSE.Util;

    /** far: view distance (fog end); cells: terrain cells per chunk side; feat: feature density. */
    const DETAIL = {
        high: { far: 430, cells: 16, feat: 0.9, water: 56, creatures: 14, stars: 1500, puffs: 1.0, budget: 5 },
        standard: { far: 350, cells: 14, feat: 0.72, water: 44, creatures: 12, stars: 1100, puffs: 0.75, budget: 4 },
        low: { far: 260, cells: 10, feat: 0.45, water: 30, creatures: 7, stars: 700, puffs: 0.5, budget: 3 }
    };
    const CS = 64;                  // chunk size (m)
    const BASE_SPEED = 18;          // m/s
    const SKY_R = 650;              // sky dome radius; camera far is set beyond it
    const STEP = Math.PI / 6;       // one steer press
    const STEER_W = 3.2;            // heading spring: settles in about 1.5 s
    const TYPES = ['ice', 'ocean', 'earth', 'desert', 'lava', 'crystal', 'toxic', 'gas', 'rock'];
    /** Mirrors NSE.Universe.STYLES (first = default when a world has no style). */
    const STYLES = {
        ice: ['spires', 'glaciers', 'cracked', 'snowfields'],
        ocean: ['islands', 'archipelago', 'reefs', 'open'],
        earth: ['forest', 'meadow', 'mountains', 'lakes', 'jungle'],
        desert: ['mesas', 'dunes', 'canyons', 'salt'],
        lava: ['rivers', 'volcanoes', 'cracked'],
        crystal: ['shards', 'geodes', 'forest'],
        toxic: ['mushrooms', 'swamp', 'bubbles'],
        gas: ['bands', 'storms', 'calm'],
        rock: ['craters', 'boulders', 'canyons']
    };

    /** Camera offsets in the ship's (yaw-only) frame: x right, y up, z back. */
    const VIEWS = {
        cockpit: { off: [0, 0.7, -3.7], look: [0, -4.5, -40], fov: 70, roll: 0.35 },
        chase: { off: [0, 5.8, 15.5], look: [0, 0.2, -26], fov: 62, roll: 0 },
        wide: { off: [0, 13, 30], look: [0, -1, -24], fov: 75, roll: 0, drift: 18 }
    };

    /** How much of the low ground lies under the sea/lava/lake, by type (from world.seaLevel)... */
    const COVER = { ocean: [0.55, 0.8], earth: [0.12, 0.3], ice: [0.12, 0.28], lava: [0.18, 0.32], toxic: [0.15, 0.3], crystal: [0.08, 0.2] };
    /** ...and by style where it matters. */
    const COVER_STYLE = {
        'ocean:archipelago': [0.68, 0.8], 'ocean:reefs': [0.84, 0.9], 'ocean:open': [0.92, 0.96],
        'earth:lakes': [0.32, 0.42], 'earth:mountains': [0.06, 0.14], 'earth:meadow': [0.06, 0.14],
        'ice:cracked': [0.06, 0.12], 'ice:snowfields': [0.04, 0.1],
        'lava:volcanoes': [0.1, 0.18], 'lava:cracked': [0.06, 0.12],
        'toxic:swamp': [0.38, 0.5], 'toxic:bubbles': [0.22, 0.32]
    };

    function localPlants(w) {
        const st = w.terrain && w.terrain.style;
        return ({
            earth: st === 'jungle' ? 'thick jungle' : st === 'meadow' ? 'grass, bushes and trees' : 'trees and bushes',
            ocean: 'palm trees on the islands',
            desert: st === 'salt' ? null : 'cactus plants',
            toxic: 'giant mushrooms',
            crystal: st === 'forest' ? 'trees made of crystal' : null
        })[w.type] || null;
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();

    // --- geometry helpers ---------------------------------------------------------------------

    /** Shape templates: non-indexed positions + each vertex's 0..1 height (for colour gradients). */
    function templates(THREE) {
        function tpl(geo, baseAtZero, keep) {
            const g = geo.index ? geo.toNonIndexed() : geo;
            let p = g.attributes.position.array;
            if (keep) {         // keep only some triangles (dashed window rings)
                const out = [];
                for (let t = 0; t < p.length / 9; t++) if (keep(t)) for (let k = 0; k < 9; k++) out.push(p[t * 9 + k]);
                p = new Float32Array(out);
            } else p = new Float32Array(p);
            let lo = Infinity, hi = -Infinity;
            for (let i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
            if (baseAtZero) { for (let i = 1; i < p.length; i += 3) p[i] -= lo; hi -= lo; lo = 0; }
            const ys = new Float32Array(p.length / 3);
            for (let i = 0; i < ys.length; i++) ys[i] = (p[i * 3 + 1] - lo) / ((hi - lo) || 1);
            if (g !== geo) g.dispose();
            geo.dispose();
            return { p: p, ys: ys };
        }
        return {
            cone6: tpl(new THREE.ConeGeometry(1, 1, 6, 1, true), true),
            cyl5: tpl(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), true),
            cyl8: tpl(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), true),
            disc: tpl(new THREE.CylinderGeometry(1, 0.8, 1, 12, 1, false), true),
            ico0: tpl(new THREE.IcosahedronGeometry(1, 0), false),
            ico1: tpl(new THREE.IcosahedronGeometry(1, 1), false),
            ball: tpl(new THREE.SphereGeometry(1, 8, 4), false),
            hemi: tpl(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), true),
            cap: tpl(new THREE.SphereGeometry(1, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), true),
            octa: tpl(new THREE.OctahedronGeometry(1, 0), false),
            box: tpl(new THREE.BoxGeometry(1, 1, 1), true),
            // 16 sides, every other one kept: a band of separate lit windows.
            windows: tpl(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), true, t => (t >> 1) % 2 === 0)
        };
    }

    /** Collects triangles with per-vertex colours, then makes one BufferGeometry. */
    function Builder() { this.p = []; this.c = []; }
    Builder.prototype.v = function (x, y, z, c) { this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]); };
    Builder.prototype.add = function (T, e, c0, c1) {
        const p = T.p, ys = T.ys, P = this.p, C = this.c;
        for (let i = 0, n = ys.length; i < n; i++) {
            const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], t = ys[i];
            P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
            C.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
        }
    };
    Builder.prototype.build = function (THREE, normals) {
        if (!this.p.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        else g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    };

    const scl = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const angleTo = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

    function gradient(stops, t, out) {
        if (t <= stops[0][0]) { const c = stops[0][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const a = stops[i - 1], b = stops[i], u = (t - a[0]) / ((b[0] - a[0]) || 1);
                out[0] = a[1][0] + (b[1][0] - a[1][0]) * u; out[1] = a[1][1] + (b[1][1] - a[1][1]) * u; out[2] = a[1][2] + (b[1][2] - a[1][2]) * u;
                return out;
            }
        }
        const c = stops[stops.length - 1][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out;
    }

    // --- the surface ----------------------------------------------------------------------------

    function create(THREE, world, opts) {
        opts = opts || {};
        const type = TYPES.indexOf(world.type) >= 0 ? world.type : 'rock';
        const seed = U.hash('flylow', world.seed);
        let detail = DETAIL[opts.detail] ? opts.detail : 'standard';
        let D = DETAIL[detail];
        const gas = type === 'gas';
        const airless = !world.atmosphere || type === 'rock';
        const TR = world.terrain || { scale: 2, roughness: 0.5, ridges: 0.3, craters: 0 };
        const style = STYLES[type].indexOf(TR.style) >= 0 ? TR.style : STYLES[type][0];
        const is = s => style === s;
        const PLANTS = (NSE.Universe && typeof NSE.Universe.plants === 'function') ? NSE.Universe.plants(world) : localPlants(world);
        // Plant species to find (js/flora.js): the world's own kinds, drawn into the ground chunks.
        // Without flora.js (or plants) the older built-in trees, palms, cacti and mushrooms are drawn.
        const FL = (NSE.Flora && typeof NSE.Flora.spec === 'function' && typeof NSE.Flora.draw === 'function') ? NSE.Flora : null;
        const floraList = [];
        if (FL && PLANTS && world.flora && world.flora.species) world.flora.species.forEach(function (sd) { try { floraList.push(FL.spec(sd, world)); } catch (e) { /* skip a species that fails */ } });
        const FLORA_ON = floraList.length > 0;
        const T = templates(THREE);
        const scene = new THREE.Scene();
        scene.name = 'surface';
        const ship = opts.ship || new THREE.Object3D();
        scene.add(ship);

        // Per-seed variety, so two worlds of the same style still differ.
        const SV = U.rng(U.hash(seed, 'style-variety'));
        const DENS = SV.range(0.75, 1.2), HMUL = SV.range(0.8, 1.22), FMUL = SV.range(0.8, 1.25);

        // Geometry bookkeeping (tests check that recycled chunks really are freed).
        const geoCount = { made: 0, freed: 0 };
        const made = g => { if (g) geoCount.made++; return g; };
        const free = g => { if (g) { g.dispose(); geoCount.freed++; } };
        const owned = { geos: [], mats: [] };      // long-lived things freed on dispose
        const keepGeo = g => { owned.geos.push(made(g)); return g; };
        const keepMat = m => { owned.mats.push(m); return m; };

        const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
        const hexOf = c => '#' + new THREE.Color(c[0], c[1], c[2]).getHexString();
        const P = world.palette || { low: '#5a5650', mid: '#7a766e', high: '#9a958c', peak: '#c4beb4', sea: '#000000' };
        const pal = { low: lin(P.low), mid: lin(P.mid), high: lin(P.high), peak: lin(P.peak), sea: lin(P.sea || '#204060') };
        const WHITE = [1, 1, 1];
        const starCol = lin(opts.starColor || '#fff2d6');
        const mixc = U.mix;

        // ----- terrain height -------------------------------------------------------------------
        const n1 = U.noise3(U.hash('surface', seed));
        const n2 = U.noise3(U.hash('surface2', seed));
        const F = FMUL / (210 - (TR.scale || 2) * 28);
        const GAIN = 0.38 + (TR.roughness || 0.5) * 0.3;
        const RIDGE = TR.ridges || 0;
        let CRATER = TR.craters || 0;
        if (type === 'rock') CRATER = is('craters') ? Math.max(0.7, CRATER) : is('boulders') ? 0.25 : 0.15;
        if (is('volcanoes') || is('geodes')) CRATER = 0;     // their own round landforms instead

        /** Round landforms on a jittered grid: one per cell (or none), the same for height and features. */
        const CELL = {
            crater: { name: 'cr', size: type === 'rock' ? 70 : 110, prob: 0.63, r0: 7, r1: 31 },
            geode: { name: 'geo', size: 95, prob: 0.8, r0: 12, r1: 24 },
            volcano: { name: 'vol', size: 170, prob: 0.75, r0: 45, r1: 75 },
            atoll: { name: 'atl', size: 130, prob: 0.8, r0: 22, r1: 42 },
            blister: { name: 'bl', size: 38, prob: 0.6, r0: 3, r1: 7 }
        };
        const cellOut = { x: 0, z: 0, r: 0, k: 0 };
        function cellAt(C, gx, gz) {
            const hh = U.hash(seed, C.name, gx, gz);
            if ((hh & 255) / 255 > C.prob) return null;
            cellOut.r = C.r0 + ((hh >>> 8) & 255) / 255 * (C.r1 - C.r0);
            cellOut.x = (gx + 0.25 + ((hh >>> 16) & 255) / 255 * 0.5) * C.size;
            cellOut.z = (gz + 0.25 + ((hh >>> 24) & 255) / 255 * 0.5) * C.size;
            cellOut.k = ((hh >>> 4) & 15) / 15;
            return cellOut;
        }
        function cellSum(C, x, z, profile) {
            const gx = Math.floor(x / C.size), gz = Math.floor(z / C.size);
            let h = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const c = cellAt(C, gx + i, gz + j);
                if (!c) continue;
                const q = Math.sqrt((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z)) / c.r;
                h += profile(q, c);
            }
            return h;
        }
        const craterP = (q, c) => {
            if (q > 1.9) return 0;
            let h = q < 1 ? -c.r * 0.24 * (1 - q * q) : 0;
            const e = (q - 1) / 0.28;
            return h + c.r * 0.08 * Math.exp(-e * e);
        };
        const geodeP = (q, c) => {
            if (q > 1.6) return 0;
            let h = q < 1 ? -c.r * 0.55 * Math.pow(1 - q * q, 0.7) : 0;
            const e = (q - 1) / 0.22;
            return h + c.r * 0.12 * Math.exp(-e * e);
        };
        const volH = c => 28 + c.k * 20;
        const volcanoP = (q, c) => {
            if (q >= 1) return 0;
            const H = volH(c);
            if (q < 0.17) return H * Math.pow(0.83, 1.4) - H * 0.22 * (1 - (q / 0.17) * (q / 0.17));
            return H * Math.pow(1 - q, 1.4);
        };
        const atollP = (q) => { if (q > 1.6) return 0; const e = (q - 1) / 0.14; return 8 * Math.exp(-e * e) + (q < 1 ? 1.5 : 0); };
        const blisterP = (q, c) => (q < 1 ? c.r * 0.55 * Math.sqrt(1 - q * q) : 0);

        function dunes(x, z, amp, freq) {
            const w = 2.5 * n2.fbm(x * 0.006, 1.7, z * 0.006, 2);
            return amp * Math.pow(1 - Math.abs(Math.sin((x * 0.55 + z * 0.83) * (freq || 0.035) + w)), 1.6);
        }
        /** Deep winding gorges cut into a high plateau (desert and rock canyons). */
        function gorge(x, z) {
            const g = Math.abs(n2.fbm(x * F * 0.7, 6.1, z * F * 0.7, 3));
            return U.smooth((0.055 - g) / 0.03);
        }
        const fb = (x, z, f, oct) => n1.fbm(x * F * f, 0.31, z * F * f, oct || 4, 2, GAIN);
        const rg = (x, z, f, yy, oct) => n1.ridged(x * F * f, yy, z * F * f, oct || 3);
        const gasAmp = is('storms') ? 1.25 : is('calm') ? 0.35 : 1;

        function baseHeight(x, z) {
            let h;
            switch (type) {
                case 'earth':
                    if (is('meadow')) h = 12 * fb(x, z, 0.7, 4);
                    else if (is('mountains')) { const r = rg(x, z, 0.7, 3.7, 4); h = 18 * fb(x, z, 1, 5) + 62 * r * r; }
                    else if (is('lakes')) h = 22 * fb(x, z, 1.7, 5);
                    else if (is('jungle')) h = 20 * fb(x, z, 1, 5) + 6 * fb(x, z, 4, 2);
                    else h = 30 * fb(x, z, 1, 5) + 18 * RIDGE * Math.max(0, rg(x, z, 0.8, 3.7) - 0.45);
                    break;
                case 'ocean':
                    if (is('archipelago')) h = 26 * fb(x, z, 2.6, 5) + 8 * rg(x, z, 3, 1.3);
                    else if (is('reefs')) h = 3 * fb(x, z, 1.5, 3) + cellSum(CELL.atoll, x, z, atollP);
                    else if (is('open')) h = 30 * fb(x, z, 0.8, 5);
                    else h = 34 * fb(x, z, 1.2, 5) + 10 * rg(x, z, 2, 1.3);
                    break;
                case 'ice':
                    if (is('glaciers')) { const r = rg(x, z, 0.9, 2.2, 4); h = 10 * fb(x, z, 1, 4) + 30 * r * r + dunes(x, z, 1); }
                    else if (is('cracked')) {
                        h = 3 * fb(x, z, 1, 3);
                        const c = Math.abs(n2.fbm(x * F * 2.6, 8.8, z * F * 2.6, 2));
                        if (c < 0.035) h -= 2.6 * (1 - U.smooth(c / 0.035));
                    } else if (is('snowfields')) h = 7 * fb(x, z, 0.7, 3) + dunes(x, z, 3.5, 0.025);
                    else h = 14 * fb(x, z, 1, 4) + 12 * RIDGE * rg(x, z, 1.1, 2.2) + dunes(x, z, 2.2);
                    break;
                case 'desert':
                    if (is('dunes')) h = 3 * fb(x, z, 0.8, 3) + dunes(x, z, 9, 0.022) + dunes(x * 0.7 + 50, z * 1.3, 3, 0.05);
                    else if (is('canyons')) h = 30 + 4 * fb(x, z, 1.4, 3) - 32 * gorge(x, z);
                    else if (is('salt')) h = 1.2 * fb(x, z, 0.6, 3);
                    else {
                        const m = n2.fbm(x * F * 0.55, 4.2, z * F * 0.55, 3);
                        const mesa = U.smooth((m - 0.16) / 0.05) * 22 + U.smooth((m - 0.3) / 0.03) * 8;
                        h = 8 * fb(x, z, 0.8, 3) + dunes(x, z, 5) + mesa;
                    }
                    break;
                case 'lava':
                    if (is('volcanoes')) h = 10 * fb(x, z, 1, 4) + cellSum(CELL.volcano, x, z, volcanoP);
                    else if (is('cracked')) h = 6 * fb(x, z, 1, 4) + 5 * rg(x, z, 1.5, 2.9);
                    else h = 16 * fb(x, z, 1, 5) + 14 * rg(x, z, 1.3, 2.9, 4);
                    break;
                case 'crystal':
                    if (is('geodes')) h = 8 * fb(x, z, 1, 4) + cellSum(CELL.geode, x, z, geodeP);
                    else if (is('forest')) h = 10 * fb(x, z, 0.9, 4) + 6 * rg(x, z, 1.2, 2.1);
                    else { const r = rg(x, z, 1.2, 2.1, 4); h = 10 * fb(x, z, 1, 4) + 22 * (0.3 + RIDGE) * r * r; }
                    break;
                case 'toxic':
                    if (is('swamp')) h = 5 * fb(x, z, 1.5, 3) + 1.5 * fb(x, z, 6, 2);
                    else if (is('bubbles')) h = 10 * fb(x, z, 1, 4) + cellSum(CELL.blister, x, z, blisterP);
                    else h = 14 * fb(x, z, 1, 4) + 3.5 * fb(x, z, 5, 2);
                    break;
                case 'gas':
                    h = gasAmp * (9 * n1.fbm(x * F * 0.6, 0.3, z * F * 0.6, 3) + 3 * Math.sin(z * 0.03 + x * 0.01 + 2 * n2.fbm(x * 0.004, 9.1, z * 0.004, 2)) + 2.5 * n1.fbm(x * 0.03, 4.4, z * 0.03, 2));
                    break;
                default:
                    if (is('canyons')) h = 24 + 4 * fb(x, z, 1.4, 4) - 28 * gorge(x, z);
                    else h = 9 * fb(x, z, 1, 5);
            }
            if (CRATER > 0 && !gas) h += cellSum(CELL.crater, x, z, craterP) * CRATER;
            return h * HMUL;
        }

        // Sea level from the world's own sea fraction, measured on this terrain.
        const hasSea = !gas && world.seaLevel > 0 && COVER[type] !== undefined;
        let seaH = -Infinity;
        const samples = [];
        {
            const r = U.rng(U.hash(seed, 'sample'));
            for (let i = 0; i < 600; i++) samples.push(baseHeight(r.range(-1000, 1000), r.range(-1000, 1000)));
            samples.sort((a, b) => a - b);
        }
        const quant = q => samples[Math.max(0, Math.min(samples.length - 1, Math.floor(q * samples.length)))];
        if (hasSea) {
            const cv = COVER_STYLE[type + ':' + style] || COVER[type];
            seaH = quant(U.lerp(cv[0], cv[1], U.clamp((world.seaLevel - 0.05) / 0.85, 0, 1)));
        }
        // Rivers (earth), lava rivers and lava cracks.
        const rivers = hasSea && ((type === 'earth' && !is('lakes')) || type === 'lava');
        const riverW = type === 'lava' ? (is('cracked') ? 0.03 : is('volcanoes') ? 0.025 : 0.05) : 0.03;
        const riverF = is('cracked') ? 2.6 : 0.9;

        function height(x, z) {
            let h = baseHeight(x, z);
            if (rivers && h > seaH - 1.6 && h < seaH + 30) {
                const r = Math.abs(n2.fbm(x * F * riverF, 7.7, z * F * riverF, 3));
                if (r < riverW) {
                    const m = 1 - U.smooth(r / riverW);
                    h += (seaH - 1.6 - h) * m;
                }
            }
            return h;
        }
        /** The terrain to clear: terrain, or the sea/lava/lake surface where higher. */
        function ground(x, z) { const h = height(x, z); return h > seaH ? h : seaH; }

        const lo = quant(0.02), hi = quant(0.985);
        const norm = h => (h - lo) / ((hi - lo) || 1);
        const seaN = hasSea ? norm(seaH) : -1;

        // ----- colours --------------------------------------------------------------------------
        let stops, cliff;
        switch (type) {
            case 'earth': case 'ocean': {
                const grass = is('meadow') ? mixc(pal.mid, pal.low, 0.18) : is('jungle') ? scl(pal.mid, 0.8) : pal.mid;
                const snow = is('mountains') ? 0.74 : (is('jungle') || is('meadow') || is('lakes') || is('reefs') || is('archipelago') || is('open')) ? 1.5 : 0.97;      // snow caps only on high ground
                stops = [[seaN - 0.05, mixc(pal.low, pal.sea, 0.5)], [seaN, pal.low], [seaN + 0.04, pal.low], [seaN + 0.08, grass], [0.62, scl(grass, 0.82)],
                    [Math.min(0.8, snow - 0.08), pal.high], [snow - 0.03, pal.high], [snow, pal.peak]];
                cliff = scl(pal.high, 0.8); break;
            }
            case 'ice':
                stops = [[Math.max(0, seaN), mixc(pal.low, pal.mid, 0.5)], [Math.max(0, seaN) + 0.12, pal.mid], [Math.max(0, seaN) + 0.3, pal.high], [0.62, pal.high], [0.82, pal.peak]];
                if (is('cracked')) stops = [[0, scl(pal.low, 0.7)], [0.25, pal.mid], [0.45, pal.high], [0.75, pal.peak]];
                cliff = is('cracked') ? scl(pal.low, 0.55) : mixc(pal.low, pal.mid, 0.4); break;
            case 'desert':
                stops = is('salt') ? [[0, mixc(pal.high, pal.peak, 0.55)], [0.6, mixc(pal.high, pal.peak, 0.85)], [1, pal.peak]]
                    : [[0, pal.low], [0.3, pal.mid], [0.62, pal.high], [0.9, pal.peak]];
                cliff = null; break;     // banded strata, below
            case 'lava':
                stops = [[seaN, scl(pal.low, 0.8)], [0.5, pal.mid], [0.82, pal.high], [1, pal.peak]];
                cliff = scl(pal.low, 0.9); break;
            case 'crystal':
                stops = [[Math.max(0, seaN), pal.low], [0.42, pal.mid], [0.75, pal.high], [0.95, pal.peak]];
                cliff = scl(pal.mid, 0.75); break;
            case 'toxic':
                stops = [[seaN, scl(pal.low, 0.85)], [seaN + 0.06, pal.mid], [0.6, pal.high], [0.92, pal.peak]];
                cliff = scl(pal.low, 0.9); break;
            default:
                stops = [[0, pal.low], [0.45, pal.mid], [0.8, pal.high], [1, pal.peak]];
                cliff = scl(pal.low, 0.85);
        }
        stops.sort((a, b) => a[0] - b[0]);
        const lavaShore = type === 'lava' ? mixc(pal.sea, pal.low, 0.45) : type === 'toxic' ? mixc(pal.sea, pal.low, 0.65) : null;
        const jitAmp = is('salt') ? 0.16 : 0.1;

        function faceColour(h, slope, jitter, out) {
            gradient(stops, norm(h), out);
            if ((type === 'desert' || (type === 'rock' && is('canyons'))) && slope > 0.3) {
                const s = 0.5 + 0.5 * Math.sin(h * 0.9);
                const st = mixc(pal.low, pal.high, s);
                const k = U.smooth((slope - 0.3) / 0.2);
                out[0] += (st[0] - out[0]) * k; out[1] += (st[1] - out[1]) * k; out[2] += (st[2] - out[2]) * k;
            } else if (cliff && slope > 0.22) {
                const k = U.smooth((slope - 0.22) / 0.25) * 0.85;
                out[0] += (cliff[0] - out[0]) * k; out[1] += (cliff[1] - out[1]) * k; out[2] += (cliff[2] - out[2]) * k;
            }
            out[0] *= jitter; out[1] *= jitter; out[2] *= jitter;
            return out;
        }
        /** Gas giant bands across x. */
        const bandDark = is('storms') ? 0.68 : 1;
        const bandCols = [pal.low, pal.peak, pal.high, pal.mid, pal.peak, scl(pal.low, 0.85)].map(c => scl(c, bandDark));
        function bandColour(x, z, out) {
            const b = x * 0.022 + 2.2 * n2.fbm(x * 0.004, 3.3, z * 0.004, 2) + 100;
            const i = Math.floor(b), f = b - i;
            const a = bandCols[i % bandCols.length], c = bandCols[(i + 1) % bandCols.length];
            const k = U.smooth((f - 0.72) / 0.28);
            out[0] = a[0] + (c[0] - a[0]) * k; out[1] = a[1] + (c[1] - a[1]) * k; out[2] = a[2] + (c[2] - a[2]) * k;
            return out;
        }

        // ----- flight state (heading-based) ------------------------------------------------------
        const pr = U.rng(U.hash(seed, 'path'));
        const WA = [pr.range(0.16, 0.26), pr.range(0.06, 0.1)];
        const WL = [pr.range(150, 220), pr.range(60, 90)];
        const WP = [pr.range(0, 6.283), pr.range(0, 6.283)];
        const clearPhase = pr.range(0, 6.283);
        const wander = s => WA[0] * Math.sin(s / WL[0] + WP[0]) + WA[1] * Math.sin(s / WL[1] + WP[1]);
        const wanderD = s => WA[0] / WL[0] * Math.cos(s / WL[0] + WP[0]) + WA[1] / WL[1] * Math.cos(s / WL[1] + WP[1]);

        let d = 0, speedK = 1, time = 0, lastDt = 0, laneTick = 0, relane = false;
        let headT = 0, headB = 0, headBV = 0;        // steer target, eased base heading, its rate
        const shipPos = new THREE.Vector3();
        let yaw = 0, yawRate = 0, bank = 0, pitch = 0, vy = 0, tgtS = 0, speedT = 1;
        const fwd = { x: 0, z: -1 }, rgt = { x: 1, z: 0 };
        const tmpP = { x: 0, z: 0 };
        function setFrame() {
            fwd.x = -Math.sin(yaw); fwd.z = -Math.cos(yaw);
            rgt.x = Math.cos(yaw); rgt.z = -Math.sin(yaw);
        }
        /** A point `ah` metres ahead of the ship and `lat` to its right. */
        function aheadPoint(ah, lat, out) {
            out.x = shipPos.x + fwd.x * ah + rgt.x * lat; out.z = shipPos.z + fwd.z * ah + rgt.z * lat;
            return out;
        }
        const alongOf = (x, z) => (x - shipPos.x) * fwd.x + (z - shipPos.z) * fwd.z;
        /**
         * The course ahead if nobody presses anything (heading spring + wander, integrated in
         * 10 m steps). New chunks keep their tall things out of it, and creatures, clouds and
         * smoke are placed along it. Re-predicted often, and at once after a steer.
         */
        const LANE_N = 72, LANE_STEP = 10;
        const laneX = new Float64Array(LANE_N), laneZ = new Float64Array(LANE_N);
        const laneBox = [0, 0, 0, 0];
        function predictLane() {
            let hb = headB, hv = headBV, x = shipPos.x, z = shipPos.z, dd = d;
            const v = BASE_SPEED * speedK, h = LANE_STEP / v;
            laneBox[0] = laneBox[2] = Infinity; laneBox[1] = laneBox[3] = -Infinity;
            for (let i = 0; i < LANE_N; i++) {
                laneX[i] = x; laneZ[i] = z;
                laneBox[0] = Math.min(laneBox[0], x); laneBox[1] = Math.max(laneBox[1], x);
                laneBox[2] = Math.min(laneBox[2], z); laneBox[3] = Math.max(laneBox[3], z);
                for (let k = 0; k < 4; k++) { hv += (STEER_W * STEER_W * (headT - hb) - 2 * STEER_W * hv) * h / 4; hb += hv * h / 4; }
                const yy = hb + wander(dd);
                x -= Math.sin(yy) * LANE_STEP; z -= Math.cos(yy) * LANE_STEP; dd += LANE_STEP;
            }
        }
        /** Is a point (with this radius) in the ship's way ahead? */
        function inLane(x, z, radius) {
            const m = radius + 18;
            if (x < laneBox[0] - m || x > laneBox[1] + m || z < laneBox[2] - m || z > laneBox[3] + m) return false;
            for (let i = 0; i < LANE_N; i++) {
                const dx = x - laneX[i], dz = z - laneZ[i];
                if (dx * dx + dz * dz < m * m) return true;
            }
            return false;
        }
        /** Size factor for a tall thing: in the lane it grows only knee-high (a small tree, a stubby spire). */
        function shrink(x, z, height, radius) {
            if (height <= 4.5 || !inLane(x, z, radius)) return 1;
            return Math.max(0.2, 4 / height);
        }
        /** A point `ah` metres along the predicted course and `lat` metres to its right. */
        function lanePoint(ah, lat, out) {
            if (ah <= 0) return aheadPoint(ah, lat, out);
            const f = Math.min(LANE_N - 1.001, ah / LANE_STEP), i = Math.floor(f), u = f - i;
            const dx = laneX[i + 1] - laneX[i], dz = laneZ[i + 1] - laneZ[i], L = Math.hypot(dx, dz) || 1;
            const extra = Math.max(0, ah - (LANE_N - 1) * LANE_STEP);
            out.x = laneX[i] + dx * u + (dx / L) * extra - (dz / L) * lat;
            out.z = laneZ[i] + dz * u + (dz / L) * extra + (dx / L) * lat;
            return out;
        }
        const latOf = (x, z) => (x - shipPos.x) * rgt.x + (z - shipPos.z) * rgt.z;

        // ----- materials --------------------------------------------------------------------------
        const matTerrain = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
        const matDeck = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true }));
        const matGlow = keepMat(new THREE.MeshBasicMaterial({ vertexColors: true }));

        // ----- lights, fog, sky -------------------------------------------------------------------
        const atmoCol = world.atmosphere ? lin(world.atmosphere.color) : [0, 0, 0];
        let skyTop, skyMid, skyHor;
        if (airless) {
            skyTop = [0.0, 0.0, 0.002]; skyMid = [0.001, 0.0015, 0.004]; skyHor = [0.004, 0.005, 0.009];
        } else {
            let a = atmoCol;
            if (gas) a = mixc(mixc(pal.mid, pal.peak, 0.3), a, 0.25);
            if (is('storms')) a = scl(mixc(a, [0.3, 0.3, 0.36], 0.35), 0.62);
            const c = new THREE.Color(a[0], a[1], a[2]);
            const hsl = { h: 0, s: 0, l: 0 };
            c.getHSL(hsl);
            const top = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.1 + 0.08), hsl.l * (is('storms') ? 0.32 : 0.42));
            skyTop = [top.r, top.g, top.b];
            skyMid = mixc(a, skyTop, 0.3);
            skyHor = mixc(mixc(a, WHITE, (is('storms') ? 0.15 : 0.4) - hsl.l * 0.2), starCol, 0.12);
            if (type === 'toxic') skyHor = mixc(skyHor, pal.sea, is('swamp') ? 0.3 : 0.2);
        }
        const fogCol = airless ? [0.006, 0.007, 0.012] : skyHor;
        const fogK = type === 'toxic' ? (is('swamp') ? [0.08, 0.62] : [0.12, 0.72]) : airless ? [0.5, 0.97] : type === 'lava' ? [0.25, 0.85]
            : is('storms') ? [0.2, 0.85] : [0.35, 0.95];
        scene.fog = new THREE.Fog(new THREE.Color(fogCol[0], fogCol[1], fogCol[2]), D.far * fogK[0], D.far * fogK[1]);
        scene.background = new THREE.Color(fogCol[0], fogCol[1], fogCol[2]);

        const sr = U.rng(U.hash(seed, 'sun'));
        const sunAz = sr.sign() * sr.range(0.9, 1.9), sunEl = sr.range(0.42, 0.68);
        const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl)).normalize();
        const sun = new THREE.DirectionalLight(new THREE.Color(starCol[0], starCol[1], starCol[2]), airless ? 2.9 : is('storms') ? 1.8 : 2.4);
        sun.position.copy(sunDir).multiplyScalar(100);
        scene.add(sun);
        const hemiSky = airless ? mixc([0.5, 0.52, 0.6], starCol, 0.3) : mixc(skyMid, WHITE, 0.35);
        const hemi = new THREE.HemisphereLight(new THREE.Color(hemiSky[0], hemiSky[1], hemiSky[2]),
            new THREE.Color(pal.mid[0], pal.mid[1], pal.mid[2]), airless ? 0.85 : 1.15);
        scene.add(hemi);
        scene.add(new THREE.AmbientLight(0xffffff, airless ? 0.25 : 0.2));

        const skyGroup = new THREE.Group();     // follows the camera
        scene.add(skyGroup);
        {
            const g = keepGeo(new THREE.SphereGeometry(SKY_R, 24, 16));
            const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const e = pos.getY(i) / SKY_R;
                let c;
                if (e <= 0) c = skyHor;
                else { const t = 1 - Math.pow(e, 0.72); c = t < 0.55 ? mixc(skyTop, skyMid, t / 0.55) : mixc(skyMid, skyHor, (t - 0.55) / 0.45); }
                cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
            }
            g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            const dome = new THREE.Mesh(g, keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
            dome.renderOrder = -10;      // drawn first (and the CPU test renderer paints its own gradient instead)
            dome.frustumCulled = false;
            skyGroup.add(dome);
        }
        // The sun: a disc and a soft halo.
        {
            const sc = mixc(starCol, WHITE, 0.5);
            const disc = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(SKY_R * 0.03, 14, 8)), keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(sc[0], sc[1], sc[2]), fog: false })));
            disc.position.copy(sunDir).multiplyScalar(SKY_R * 0.86);
            disc.renderOrder = -9;
            skyGroup.add(disc);
            const halo = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(SKY_R * 0.075, 14, 8)), keepMat(new THREE.MeshBasicMaterial({
                color: new THREE.Color(starCol[0], starCol[1], starCol[2]), fog: false, transparent: true, opacity: airless ? 0.18 : 0.28, depthWrite: false, blending: THREE.AdditiveBlending })));
            halo.position.copy(disc.position).multiplyScalar(1.01);
            halo.renderOrder = -9;
            skyGroup.add(halo);
        }
        // A rainbow (rare: world.rainbowSky): a soft arc in the sky, ahead of the ship as Fly Low begins.
        let rainbow = null, rainbowAz = 0;
        if (world.rainbowSky && !airless && !gas) {
            const rr = U.rng(U.hash(seed, 'rainbow'));
            rainbowAz = wander(0) + rr.sign() * rr.range(0.15, 0.4);
            const dist = SKY_R * 0.8, ang = 34 * Math.PI / 180, band = 5.5 * Math.PI / 180;
            const Rin = dist * Math.tan(ang - band / 2), Rout = dist * Math.tan(ang + band / 2);
            const g = keepGeo(new THREE.RingGeometry(Rin, Rout, 56, 7, 0, Math.PI));
            const pos = g.attributes.position, cols = new Float32Array(pos.count * 4);
            const bands = ['#8a6aff', '#5a8aff', '#5ad8ff', '#6aff8a', '#ffe85a', '#ffa04a', '#ff5a5a'].map(lin);
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), len = Math.hypot(x, y);
                const u = U.clamp((len - Rin) / (Rout - Rin), 0, 1), f = u * (bands.length - 1), j = Math.min(bands.length - 2, Math.floor(f));
                const c = mixc(bands[j], bands[j + 1], f - j);
                const th = Math.atan2(y, x);
                const ends = U.smooth(Math.min(th, Math.PI - th) / 0.5);
                const edge = Math.sin(Math.PI * u);
                cols[i * 4] = c[0]; cols[i * 4 + 1] = c[1]; cols[i * 4 + 2] = c[2]; cols[i * 4 + 3] = 0.42 * ends * edge;
            }
            g.setAttribute('color', new THREE.BufferAttribute(cols, 4));
            rainbow = new THREE.Mesh(g, keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })));
            const el = -0.12;
            rainbow.position.set(-Math.sin(rainbowAz) * Math.cos(el) * dist, Math.sin(el) * dist, -Math.cos(rainbowAz) * Math.cos(el) * dist);
            rainbow.lookAt(0, Math.sin(el) * dist, 0);
            rainbow.renderOrder = -8;
            rainbow.frustumCulled = false;
            skyGroup.add(rainbow);
        }
        // Stars on airless worlds.
        if (airless) {
            const r = U.rng(U.hash(seed, 'stars'));
            const n = D.stars, pos = new Float32Array(n * 3), cols = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
                const y = Math.abs(u) * 0.98 + 0.02;      // upper sky only (the ground hides the rest)
                pos[i * 3] = Math.cos(a) * s * SKY_R * 0.93; pos[i * 3 + 1] = y * SKY_R * 0.93; pos[i * 3 + 2] = Math.sin(a) * s * SKY_R * 0.93;
                const b = 0.35 + r() * r() * 0.65, tint = r();
                cols[i * 3] = b * (tint > 0.8 ? 1 : 0.85); cols[i * 3 + 1] = b * 0.9; cols[i * 3 + 2] = b * (tint < 0.3 ? 1 : 0.85);
            }
            const g = keepGeo(new THREE.BufferGeometry());
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            const pts = new THREE.Points(g, keepMat(new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
            pts.frustumCulled = false;
            pts.renderOrder = -9;
            skyGroup.add(pts);
        }
        // The parent planet, big in a moon's sky (lit by the sun, so it shows a phase).
        if (opts.skyPlanet && opts.skyPlanet.color) {
            const ang = U.clamp(0.12 + (opts.skyPlanet.radius || 30) * 0.004, 0.14, 0.3);
            const dist = SKY_R * 0.8, rad = dist * Math.tan(ang);
            const g = keepGeo(new THREE.SphereGeometry(rad, 32, 20));
            const base = lin(opts.skyPlanet.color), pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
            const br = U.rng(U.hash(seed, 'skyplanet'));
            const ph = br.range(0, 6), fr = br.range(5, 11);
            for (let i = 0; i < pos.count; i++) {
                const lat = pos.getY(i) / rad;
                const k = 0.86 + 0.14 * Math.sin(lat * fr + ph) + 0.06 * Math.sin(lat * fr * 2.7);
                cols[i * 3] = base[0] * k; cols[i * 3 + 1] = base[1] * k; cols[i * 3 + 2] = base[2] * k;
            }
            g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            const planet = new THREE.Mesh(g, keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false })));
            const az = -0.35 * sr.sign(), el = 0.32;
            planet.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(dist);
            planet.rotation.z = 0.25;
            skyGroup.add(planet);
        }

        // ----- water / lava / frozen lake ---------------------------------------------------------
        let water = null, waterCell = 0, waterKey = '', waterBase = null;
        const WAVE = is('open') ? 0.9 : ({ ocean: 0.55, earth: 0.3, ice: 0, lava: 0.14, toxic: 0.16, crystal: 0.06 }[type] || 0);
        const glowSea = !!(world.palette && world.palette.seaGlow) || type === 'lava' || type === 'toxic';
        let waterMat = null;
        if (hasSea) {
            if (glowSea) waterMat = new THREE.MeshBasicMaterial({ vertexColors: true });
            else if (type === 'ice') waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.12, metalness: 0.05 });
            else waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.05,
                emissive: new THREE.Color(pal.sea[0], pal.sea[1], pal.sea[2]), emissiveIntensity: type === 'crystal' ? 0.5 : 0.08 });
            keepMat(waterMat);
        }
        const waterCols = type === 'ice' ? [mixc(pal.sea, WHITE, 0.55), mixc(pal.sea, WHITE, 0.72)]
            : type === 'lava' ? [pal.sea, mixc(pal.sea, lin('#ffd060'), 0.6)]
                : type === 'toxic' ? [pal.sea, mixc(pal.sea, lin('#e8ff80'), 0.45)]
                    : type === 'crystal' ? [mixc(pal.sea, pal.high, 0.3), mixc(pal.sea, pal.peak, 0.55)]
                        : is('reefs') ? [mixc(pal.sea, lin('#2fd0c8'), 0.45), mixc(pal.sea, lin('#9af0e8'), 0.5)]
                            : [scl(pal.sea, 0.9), mixc(pal.sea, lin('#9adfff'), 0.25)];
        // Shallow water near the coasts is lighter (turquoise lagoons over sand, deep blue further out).
        const shallowCol = !hasSea || type === 'ice' ? null : type === 'lava' ? mixc(pal.sea, lin('#ffd060'), 0.5)
            : type === 'toxic' ? mixc(pal.sea, lin('#e8ff9a'), 0.45) : type === 'crystal' ? mixc(pal.sea, pal.peak, 0.5)
                : mixc(pal.sea, lin(is('reefs') ? '#5ff0dc' : '#8ae6d6'), is('reefs') ? 0.7 : 0.55);
        const depthCache = new Map();
        function depthAt(X, Z) {
            const key = X + ',' + Z;
            let dep = depthCache.get(key);
            if (dep === undefined) {
                dep = seaH - height(X * waterCell, Z * waterCell);
                depthCache.set(key, dep);
                if (depthCache.size > 24000) depthCache.delete(depthCache.keys().next().value);
            }
            return dep;
        }
        function buildWater() {
            if (water) { scene.remove(water); free(water.geometry); water = null; }
            depthCache.clear();
            if (!hasSea) return;
            const seg = D.water, size = D.far * 2.15;
            const g = made(new THREE.PlaneGeometry(size, size, seg, seg));
            g.rotateX(-Math.PI / 2);
            g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
            waterBase = Float32Array.from(g.attributes.position.array);
            waterCell = size / seg;
            water = new THREE.Mesh(g, waterMat);
            water.frustumCulled = false;
            water.position.y = seaH;
            scene.add(water);
            waterKey = '';
            updateWater(0);
        }
        function updateWater(t) {
            if (!water) return;
            const wx = Math.round(shipPos.x / waterCell) * waterCell, wz = Math.round(shipPos.z / waterCell) * waterCell;
            water.position.x = wx; water.position.z = wz;
            const pos = water.geometry.attributes.position, a = pos.array, n = pos.count;
            const key = wx + ',' + wz;
            if (key !== waterKey) {      // world-locked colour speckle, recomputed only when the plane steps
                waterKey = key;
                const ca = water.geometry.attributes.color.array;
                for (let i = 0; i < n; i++) {
                    const X = Math.round((waterBase[i * 3] + wx) / waterCell), Z = Math.round((waterBase[i * 3 + 2] + wz) / waterCell);
                    const k = (U.hash(seed, X, Z) & 1023) / 1023;
                    const c = waterCols[0], c2 = waterCols[1], m = k * k * 0.8;
                    let cr = c[0] + (c2[0] - c[0]) * m, cg = c[1] + (c2[1] - c[1]) * m, cb = c[2] + (c2[2] - c[2]) * m;
                    if (shallowCol) {
                        const sh = (1 - U.smooth(depthAt(X, Z) / 4.5)) * 0.8;
                        cr += (shallowCol[0] - cr) * sh; cg += (shallowCol[1] - cg) * sh; cb += (shallowCol[2] - cb) * sh;
                    }
                    ca[i * 3] = cr; ca[i * 3 + 1] = cg; ca[i * 3 + 2] = cb;
                }
                water.geometry.attributes.color.needsUpdate = true;
                if (!WAVE) { for (let i = 0; i < n; i++) a[i * 3 + 1] = 0; pos.needsUpdate = true; }
            }
            if (WAVE) {
                const sp = type === 'ocean' || type === 'earth' ? 1 : 0.35;
                for (let i = 0; i < n; i++) {
                    const x = waterBase[i * 3] + wx, z = waterBase[i * 3 + 2] + wz;
                    a[i * 3 + 1] = WAVE * (0.55 * Math.sin(x * 0.085 + t * 0.8 * sp) + 0.45 * Math.sin(z * 0.07 - t * 0.6 * sp + x * 0.03));
                }
                pos.needsUpdate = true;
            }
            if (glowSea) {          // slow, gentle glow (8 s period, never a flash)
                const k = 0.9 + 0.1 * Math.sin(t * 0.785);
                waterMat.color.setRGB(k, k, k);
            }
        }

        // ----- streamed chunks --------------------------------------------------------------------
        const chunks = new Map();
        const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
        function put(B, tpl, x, y, z, sx, sy, sz, rx, ry, rz, c0, c1) {
            if (cityMask && cityQ(x, z) < 1.05) return;       // cities replace the wild scenery
            q.setFromEuler(eul.set(rx || 0, ry || 0, rz || 0));
            mtx.compose(vp.set(x, y, z), q, vs.set(sx, sy, sz));
            B.add(tpl, mtx.elements, c0, c1 || c0);
        }
        /** Tall things are remembered per chunk so the ship climbs over them. */
        let curObs = null;
        function tall(x, z, topY, radius) { if (curObs && !(cityMask && cityQ(x, z) < 1.05)) curObs.push(x, z, radius, topY); }
        let cityMask = false;
        function slopeAt(x, z) {
            const gx = height(x + 1.5, z) - height(x - 1.5, z), gz = height(x, z + 1.5) - height(x, z - 1.5);
            return Math.sqrt(gx * gx + gz * gz) / 3;
        }
        const hueShift = (c, dh, ds, dl) => {
            const k = new THREE.Color(c[0], c[1], c[2]), h = { h: 0, s: 0, l: 0 };
            k.getHSL(h); k.setHSL((h.h + dh + 1) % 1, U.clamp(h.s + ds, 0, 1), U.clamp(h.l + dl, 0, 1));
            return [k.r, k.g, k.b];
        };
        const fr0 = U.rng(U.hash(seed, 'flora'));
        const capCols = [lin(fr0.pick(['#c86ad8', '#e8a040', '#e85a7a', '#6ad8c8', '#f0d040'])), lin(fr0.pick(['#ff9ad8', '#a8ff6a', '#ffb060', '#8ab0ff']))];
        const leafCols = [scl(pal.mid, 0.62), scl(hueShift(pal.mid, 0.04, 0.05, -0.04), 0.7), scl(pal.mid, 0.8)];
        const flowerCols = [lin('#ffffff'), lin(fr0.pick(['#ffe14a', '#ffd0f0', '#ff8ab0', '#c8a0ff'])), lin(fr0.pick(['#ff6a6a', '#ffb040', '#8ad0ff', '#f0f080']))];
        const coralCols = [lin('#ff8a9a'), lin('#ffb060'), lin('#c88aff'), lin('#ff6ad0')];
        const civ = world.civ;
        const winCol = civ ? lin(civ.lights || '#ffd27a') : null;

        function features(S, G, r, x0, z0) {
            const k = D.feat * DENS * (civ ? 0.55 : 1);      // cities, farms and solar fields take the place of some wild scenery
            const cnt = base => { const v = base * k, f = Math.floor(v); return f + (r() < v - f ? 1 : 0); };
            const spot = () => { tmpP.x = x0 + r() * CS; tmpP.z = z0 + r() * CS; return tmpP; };
            const dry = (h) => !hasSea || h > seaH + 0.35;
            const rock = (n, lo, hi, c0, c1, flat) => {
                for (let i = 0; i < n; i++) {
                    const p = spot(), h = Math.max(height(p.x, p.z), hasSea && type === 'ice' ? seaH : -Infinity);
                    let s = r.range(lo, hi);
                    if (!dry(h) && type !== 'ice') continue;
                    s *= shrink(p.x, p.z, s * (flat || 0.8), s * 1.2);
                    put(S, T.ico0, p.x, h - s * 0.15, p.z, s * 1.2, s * (flat || 0.8), s, r() * 0.6, r() * 6, r() * 0.3, c0, c1);
                    if (s > 3) tall(p.x, p.z, h + s * (flat || 0.8), s * 1.2);
                }
            };
            // Each cell-landform lying in this chunk (geodes, volcano tops).
            const eachCell = (C, fn) => {
                const g0x = Math.floor(x0 / C.size) - 1, g1x = Math.floor((x0 + CS) / C.size) + 1;
                const g0z = Math.floor(z0 / C.size) - 1, g1z = Math.floor((z0 + CS) / C.size) + 1;
                for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
                    const c = cellAt(C, gx, gz);
                    if (c && c.x >= x0 && c.x < x0 + CS && c.z >= z0 && c.z < z0 + CS) fn({ x: c.x, z: c.z, r: c.r, k: c.k });
                }
            };
            let n, i;
            switch (type) {
                case 'earth': {
                    if (!PLANTS) break;
                    // [trees, bushes, flower patches, rocks]
                    const C = { forest: [14, 9, 2, 3], meadow: [2.5, 6, 8, 2], mountains: [9, 4, 0, 6], lakes: [11, 7, 3, 3], jungle: [15, 8, 0, 1] }[style];
                    n = FLORA_ON ? 0 : cnt(C[0]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), h = height(p.x, p.z), hn = norm(h);
                        if (!dry(h) || hn > (is('mountains') ? 0.68 : 0.82)) continue;
                        if (is('forest') && n2.fbm(p.x * 0.012, 5.5, p.z * 0.012, 2) < -0.08) continue;
                        if (slopeAt(p.x, p.z) > 0.55) continue;
                        const leaf = r.pick(leafCols);
                        if (is('jungle')) {
                            let s = r.range(1.2, 1.9);
                            s *= shrink(p.x, p.z, 7.6 * s, 3.6 * s);
                            const top = 7.6 * s;
                            put(S, T.cyl5, p.x, h - 0.3, p.z, 0.4 * s, 5.2 * s, 0.4 * s, 0, r() * 6, 0, lin('#4a3424'), lin('#6a4a30'));
                            put(S, T.ico0, p.x, h + 5.6 * s, p.z, 3.6 * s, 2.2 * s, 3.6 * s, 0, r() * 6, 0, scl(leaf, 0.75), scl(leaf, 1.05));
                            tall(p.x, p.z, h + top, 3.6 * s);
                            continue;
                        }
                        let s = r.range(0.7, 1.6);
                        const pine = is('mountains') || r() < (is('forest') ? 0.55 : 0.35);
                        s *= shrink(p.x, p.z, (pine ? 7.5 : 6) * s, 2.4 * s);
                        const top = (pine ? 7.5 : 6) * s;
                        put(S, T.cyl5, p.x, h - 0.3, p.z, 0.3 * s, 2.2 * s, 0.3 * s, 0, r() * 6, 0, lin('#5a4030'), lin('#7a5a3a'));
                        if (pine) put(S, T.cone6, p.x, h + 1.4 * s, p.z, 2.2 * s, 6 * s, 2.2 * s, 0, r() * 6, 0, scl(leaf, 0.75), leaf);
                        else put(S, T.ico0, p.x, h + 3.6 * s, p.z, 2.4 * s, 2.1 * s, 2.4 * s, 0, r() * 6, 0, scl(leaf, 0.8), scl(leaf, 1.15));
                        tall(p.x, p.z, h + top, 2.4 * s);
                    }
                    n = FLORA_ON ? 0 : cnt(C[1]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), h = height(p.x, p.z);
                        if (!dry(h) || norm(h) > 0.85) continue;
                        const s = r.range(0.7, 1.5) * (is('jungle') ? 1.6 : 1), leaf = r.pick(leafCols);
                        put(S, T.ico0, p.x, h + 0.3 * s, p.z, s, 0.7 * s, s, 0, r() * 6, 0, scl(leaf, 0.85), scl(leaf, 1.1));
                    }
                    n = FLORA_ON ? 0 : cnt(C[2]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), h0 = height(p.x, p.z);
                        if (!dry(h0) || norm(h0) > 0.75) continue;
                        const fc = r.pick(flowerCols), m = r.int(3, 4);
                        for (let j = 0; j < m; j++) {
                            const x = p.x + r.range(-2.5, 2.5), z = p.z + r.range(-2.5, 2.5), h = height(x, z);
                            put(S, T.octa, x, h + 0.25, z, 0.5, 0.22, 0.5, 0, r() * 6, 0, fc, fc);
                        }
                    }
                    rock(cnt(C[3]), 0.5, is('mountains') ? 2.6 : 1.6, scl(pal.high, 0.8), pal.high);
                    break;
                }
                case 'ocean': {
                    if (PLANTS && !FLORA_ON) {
                        n = cnt({ islands: 14, archipelago: 16, reefs: 8, open: 10 }[style]);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = height(p.x, p.z);
                            if (h < seaH + 0.6 || slopeAt(p.x, p.z) > 0.6) continue;
                            let s = r.range(0.8, 1.4);
                            s *= shrink(p.x, p.z, 5.7 * s, 2.6 * s);
                            const lean = r.range(-0.25, 0.25);
                            const leaf = r.pick(leafCols);
                            const len = 5 * s, rz = lean * 0.5;
                            put(S, T.cyl5, p.x, h - 0.3, p.z, 0.22 * s, len, 0.22 * s, lean, 0, rz, lin('#7a6040'), lin('#a08060'));
                            // The trunk's top, after its lean (Euler XYZ: z-roll first, then x-tilt).
                            const tx = p.x - Math.sin(rz) * len, ty = h - 0.3 + Math.cos(rz) * Math.cos(lean) * len, tz = p.z + Math.cos(rz) * Math.sin(lean) * len;
                            put(S, T.ico0, tx, ty, tz, 2.4 * s, 0.7 * s, 2.4 * s, 0, r() * 6, 0, scl(leaf, 0.9), scl(leaf, 1.2));
                            tall(tx, tz, ty + 0.7 * s, 2.6 * s);
                        }
                    }
                    if (is('reefs') && !floraHas('coral')) {
                        n = cnt(12);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = height(p.x, p.z);
                            if (h < seaH - 2 || h > seaH + 0.3) continue;
                            const s = r.range(0.6, 1.6), c = r.pick(coralCols);
                            put(S, T.ico0, p.x, seaH - 0.35, p.z, s * 1.3, s * 0.7, s, r(), r() * 6, 0, scl(c, 0.7), c);
                        }
                    }
                    n = cnt({ islands: 8, archipelago: 6, reefs: 3, open: 5 }[style]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), h = height(p.x, p.z);
                        if (h < seaH - 2.5 || h > seaH + 3) continue;
                        const s = r.range(0.8, 2.6);
                        put(S, T.ico0, p.x, Math.max(h, seaH - 0.6), p.z, s * 1.3, s, s, r(), r() * 6, 0, lin('#4a4a50'), lin('#7a7a80'));
                    }
                    break;
                }
                case 'ice': {
                    n = cnt(is('spires') ? 4 : is('glaciers') ? 1 : 0);
                    for (i = 0; i < n; i++) {
                        const p = spot(), m = r.int(1, 3);
                        for (let j = 0; j < m; j++) {
                            const x = p.x + r.range(-6, 6) * (j ? 1 : 0), z = p.z + r.range(-6, 6) * (j ? 1 : 0), hh = Math.max(height(x, z), seaH);
                            let rad = r.range(1.4, 3.6), tl = rad * r.range(4, 9);
                            const kk = shrink(x, z, tl - 1, rad); rad *= Math.sqrt(kk); tl *= kk;
                            put(S, T.cone6, x, hh - 1, z, rad, tl, rad, r.range(-0.08, 0.08), r() * 6, r.range(-0.08, 0.08), pal.low, mixc(pal.peak, pal.high, 0.2));
                            tall(x, z, hh - 1 + tl, rad);
                        }
                    }
                    if (is('cracked')) {           // pressure ridges: tilted ice slabs
                        n = cnt(7);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = Math.max(height(p.x, p.z), seaH), s = r.range(1.5, 4);
                            put(S, T.box, p.x, h - 0.5, p.z, s * 1.6, s * 0.8, s * 0.35, r.range(-0.5, 0.5), r() * 6, r.range(-0.3, 0.3), pal.mid, mixc(pal.high, WHITE, 0.3));
                        }
                    }
                    if (is('snowfields')) rock(cnt(7), 0.8, 2.4, pal.peak, WHITE, 0.45);       // soft snow mounds
                    rock(cnt(is('spires') ? 7 : is('glaciers') ? 6 : is('snowfields') ? 2 : 4), 0.6, 2.4, pal.mid, pal.high);
                    break;
                }
                case 'desert': {
                    if (PLANTS && !FLORA_ON) {
                        n = cnt({ dunes: 4, mesas: 6, canyons: 5 }[style] || 0);
                        const green = hueShift(lin('#5f8a3a'), ((world.seed >>> 4) % 7 - 3) * 0.04, 0, 0);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = height(p.x, p.z);
                            if (slopeAt(p.x, p.z) > 0.35) continue;
                            let tl = r.range(2.5, 6), rad = r.range(0.35, 0.6);
                            const kk = shrink(p.x, p.z, tl, 2); tl *= kk; rad *= Math.sqrt(kk);
                            put(S, T.cyl5, p.x, h - 0.3, p.z, rad, tl + 0.3, rad, 0, r() * 6, 0, scl(green, 0.8), green);
                            put(S, T.cap, p.x, h + tl - 0.05, p.z, rad, rad, rad, 0, 0, 0, green, green);
                            const arms = r.int(0, 2);
                            for (let j = 0; j < arms; j++) {
                                const a = r() * 6.28, ax = p.x + Math.cos(a) * rad * 2.2, az = p.z + Math.sin(a) * rad * 2.2, ay = h + tl * r.range(0.35, 0.6);
                                put(S, T.cyl5, ax, ay, az, rad * 0.7, tl * 0.35, rad * 0.7, 0, 0, 0, scl(green, 0.85), green);
                                put(S, T.box, (p.x + ax) / 2, ay, (p.z + az) / 2, rad * 2.4, rad * 1.1, rad * 1.1, 0, -a, 0, scl(green, 0.85), scl(green, 0.9));
                            }
                            tall(p.x, p.z, h + tl, 2);
                        }
                    }
                    if (is('salt')) {
                        rock(cnt(6), 0.4, 1.4, mixc(pal.peak, WHITE, 0.5), WHITE, 0.5);       // salt crystal mounds
                        rock(cnt(1), 0.6, 2, scl(pal.low, 0.8), pal.mid);
                    } else rock(cnt({ dunes: 3, mesas: 7, canyons: 7 }[style]), 0.5, 2.6, scl(pal.low, 0.8), pal.mid, 0.7);
                    break;
                }
                case 'lava': {
                    n = cnt({ rivers: 9, volcanoes: 4, cracked: 6 }[style]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), h = height(p.x, p.z);
                        if (!dry(h)) continue;
                        let rad = r.range(0.7, 2), tl = rad * r.range(2.5, 5);
                        const kk = shrink(p.x, p.z, tl - 0.5, rad); tl *= kk; rad *= Math.sqrt(kk);
                        put(S, T.cone6, p.x, h - 0.5, p.z, rad, tl, rad, r.range(-0.15, 0.15), r() * 6, r.range(-0.15, 0.15), scl(pal.low, 0.7), pal.high);
                        tall(p.x, p.z, h - 0.5 + tl, rad);
                    }
                    n = cnt({ rivers: 5, volcanoes: 3, cracked: 9 }[style]);
                    for (i = 0; i < n; i++) {        // glowing embers in cracks
                        const p = spot(), h = height(p.x, p.z);
                        if (!dry(h)) continue;
                        put(G, T.ico0, p.x, h - 0.15, p.z, r.range(0.3, 0.8), 0.25, r.range(0.3, 0.8), 0, r() * 6, 0, pal.sea, mixc(pal.sea, lin('#ffd060'), 0.5));
                    }
                    if (is('volcanoes')) eachCell(CELL.volcano, function (c) {      // glowing lava in each crater
                        const y = height(c.x, c.z);
                        put(G, T.cap, c.x, y - 0.4, c.z, c.r * 0.13, 0.6, c.r * 0.13, 0, 0, 0, pal.sea, mixc(pal.sea, lin('#ffe080'), 0.6));
                    });
                    break;
                }
                case 'crystal': {
                    const shard = (x, z, h, rad, tl, rx, rz, glow) => {
                        const c = r.pick([pal.high, pal.peak, pal.mid]);
                        put(glow ? G : S, T.octa, x, h, z, rad, tl, rad, rx, r() * 6, rz,
                            glow ? scl(mixc(c, pal.mid, 0.4), 0.85) : scl(c, 0.8), glow ? mixc(c, WHITE, 0.35) : c);
                    };
                    n = cnt({ shards: 5, geodes: 1, forest: 1 }[style]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), m = r.int(3, 6), big = r.range(0.8, 1.5);
                        for (let j = 0; j < m; j++) {
                            const x = p.x + (j ? r.range(-3.5, 3.5) : 0) * big, z = p.z + (j ? r.range(-3.5, 3.5) : 0) * big;
                            const h = Math.max(height(x, z), seaH);
                            let rad = r.range(0.7, 1.9) * big, tl = rad * r.range(3, 6.5);
                            const kk = shrink(x, z, tl, rad); tl *= kk; rad *= Math.sqrt(kk);
                            shard(x, z, h, rad, tl, r.range(-0.45, 0.45), r.range(-0.45, 0.45), r() < 0.6);
                            tall(x, z, h + tl, rad);
                        }
                    }
                    if (is('geodes')) eachCell(CELL.geode, function (c) {          // crystal-lined pits
                        const m = Math.round(r.range(10, 16) * Math.min(1.2, DENS));
                        for (let j = 0; j < m; j++) {
                            const a = r() * 6.28, qq = r.range(0.35, 0.9), x = c.x + Math.cos(a) * qq * c.r, z = c.z + Math.sin(a) * qq * c.r;
                            const h = height(x, z), rad = r.range(0.5, 1.3), tl = rad * r.range(2.5, 5);
                            // Lean in toward the pit's middle.
                            const lean = 0.5 + 0.4 * qq;
                            shard(x, z, h - 0.3, rad, tl, -Math.sin(a) * lean, Math.cos(a) * lean, r() < 0.7);
                        }
                    });
                    if (is('forest') && PLANTS && !FLORA_ON) {                      // trees made of crystal
                        n = cnt(9);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = height(p.x, p.z);
                            if (!dry(h) || slopeAt(p.x, p.z) > 0.5) continue;
                            let s = r.range(0.8, 1.4);
                            s *= shrink(p.x, p.z, 7.9 * s, 3 * s);
                            const trunk = 4.5 * s;
                            put(S, T.cyl5, p.x, h - 0.2, p.z, 0.3 * s, trunk, 0.3 * s, 0, r() * 6, 0, scl(pal.mid, 0.7), pal.high);
                            const m = r.int(4, 6);
                            for (let j = 0; j < m; j++) {
                                const a = j / m * 6.28 + r() * 0.5;
                                shard(p.x + Math.cos(a) * 0.5 * s, p.z + Math.sin(a) * 0.5 * s, h + trunk - 0.6, r.range(0.6, 1.0) * s, r.range(2.2, 3.4) * s,
                                    Math.sin(a) * 0.75, -Math.cos(a) * 0.75, r() < 0.6);
                            }
                            shard(p.x, p.z, h + trunk - 0.4, 0.8 * s, 3.4 * s, 0, 0, true);
                            tall(p.x, p.z, h + trunk + 3.4 * s, 3 * s);
                        }
                    }
                    n = cnt({ shards: 9, geodes: 4, forest: 5 }[style]);
                    for (i = 0; i < n; i++) {
                        const p = spot(), h = Math.max(height(p.x, p.z), seaH), rad = r.range(0.25, 0.6);
                        put(r() < 0.5 ? G : S, T.octa, p.x, h, p.z, rad, rad * r.range(2, 4), rad, r.range(-0.5, 0.5), r() * 6, r.range(-0.5, 0.5), pal.mid, pal.peak);
                    }
                    break;
                }
                case 'toxic': {
                    if (PLANTS && !FLORA_ON) {
                        n = cnt({ mushrooms: 4, swamp: 1.6, bubbles: 1.6 }[style]);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = height(p.x, p.z);
                            if (!dry(h)) continue;
                            const s = r.range(0.6, 1.6);
                            let tl = r.range(6, 15) * s, cap = r.range(3, 7) * s;
                            const kk = shrink(p.x, p.z, tl + cap * 0.55, cap); tl *= kk; cap *= Math.max(0.35, kk);
                            const cc = r.pick(capCols), lean = r.range(-0.12, 0.12);
                            put(S, T.cyl5, p.x, h - 0.5, p.z, 0.5 * s + cap * 0.08, tl + 0.5, 0.5 * s + cap * 0.08, lean, 0, 0, mixc(pal.peak, WHITE, 0.3), mixc(pal.peak, WHITE, 0.6));
                            const tx = p.x, ty = h - 0.5 + Math.cos(lean) * (tl + 0.5) - 0.2, tz = p.z + Math.sin(lean) * (tl + 0.5);
                            put(S, T.hemi, tx, ty, tz, cap, cap * 0.55, cap, 0, r() * 6, 0, scl(cc, 0.75), cc);
                            const spots = r.int(2, 4);
                            for (let j = 0; j < spots; j++) {
                                const a = r() * 6.28, rr = r.range(0.2, 0.7) * cap, yy = ty + cap * 0.55 * Math.sqrt(Math.max(0, 1 - (rr / cap) * (rr / cap))) - 0.1;
                                put(G, T.octa, tx + Math.cos(a) * rr, yy, tz + Math.sin(a) * rr, cap * 0.12, cap * 0.06, cap * 0.12, 0, a, 0, lin('#f0ffb0'), lin('#f0ffb0'));
                            }
                            tall(tx, tz, ty + cap * 0.55, cap);
                        }
                        n = cnt({ mushrooms: 9, swamp: 7, bubbles: 4 }[style]);
                        for (i = 0; i < n; i++) {
                            const p = spot(), h = height(p.x, p.z);
                            if (!dry(h)) continue;
                            const s = r.range(0.4, 1.1), cc = r.pick(capCols);
                            put(S, T.cyl5, p.x, h - 0.2, p.z, 0.18 * s, 1.6 * s, 0.18 * s, 0, 0, 0, pal.peak, pal.peak);
                            put(S, T.cap, p.x, h + 1.3 * s, p.z, 0.9 * s, 0.5 * s, 0.9 * s, 0, 0, 0, scl(cc, 0.8), cc);
                        }
                    }
                    n = cnt({ mushrooms: 0, swamp: 3, bubbles: 9 }[style]);
                    const bc = mixc(pal.sea, lin('#f0ffb0'), 0.3);
                    for (i = 0; i < n; i++) {                                       // glowing bubble domes
                        const p = spot(), h = Math.max(height(p.x, p.z), seaH), s = r.range(0.6, 1.8);
                        put(G, T.hemi, p.x, h - 0.15, p.z, s, s * 0.8, s, 0, r() * 6, 0, scl(pal.sea, 0.8), bc);
                    }
                    break;
                }
                case 'rock': {
                    const nb = cnt({ craters: 12, boulders: 30, canyons: 10 }[style]);
                    const big = is('boulders') ? 0.3 : 0.2;
                    for (i = 0; i < nb; i++) {
                        const p = spot(), h = height(p.x, p.z), s = r() < big ? r.range(1.5, is('boulders') ? 4 : 3.2) : r.range(0.3, 1.2);
                        put(S, T.ico0, p.x, h - s * 0.2, p.z, s * 1.2, s * 0.8, s, r(), r() * 6, r(), scl(pal.low, 0.85), pal.high);
                    }
                    break;
                }
            }
            // Surf along the coasts: pale foam where the sea meets the land (it comes and goes with the waves).
            if (hasSea && (type === 'ocean' || type === 'earth') && !is('open')) {
                const foam = mixc(pal.sea, WHITE, 0.82);
                for (let j = 0, nn = cnt(24); j < nn; j++) {
                    const p = spot(), h = height(p.x, p.z);
                    if (Math.abs(h - seaH) > 0.55) continue;
                    put(S, T.octa, p.x, seaH + 0.04, p.z, r.range(0.9, 2.2), 0.05, r.range(0.4, 0.9), 0, r() * 6.28, 0, foam, WHITE);
                }
            }
            if (FLORA_ON) plantsIn(S, G, r, x0, z0);
        }

        // ----- plants: every species of the world, each where it likes to grow ---------------------------
        /** A chunk's plant budget (a big tree counts for more than a tuft of grass: NSE.Flora unit). */
        const PLANT_BUDGET = {
            'earth:forest': 30, 'earth:meadow': 22, 'earth:mountains': 17, 'earth:lakes': 20, 'earth:jungle': 28, ocean: 13, 'ocean:reefs': 14, 'ocean:open': 10,
            desert: 8, 'desert:dunes': 5, toxic: 13, 'toxic:swamp': 12, crystal: 10, 'crystal:forest': 13, ice: 8, lava: 6, gas: 1.6, rock: 5
        };
        /** Each style favours its own plants (forests of trees, meadows of flowers and grass...). */
        const PLANT_STYLE = {
            forest: { tree: 1.8, pine: 1.5, blossom: 1.4, flower: 0.5, grass: 0.5 }, meadow: { tree: 0.3, pine: 0.2, blossom: 0.5, flower: 2.2, grass: 2.4, tallflower: 1.5, bush: 1.2 },
            mountains: { pine: 2, tree: 0.6, flower: 0.6, blossom: 0.4 }, lakes: { reed: 1.8, lily: 2 }, jungle: { 'jungle-tree': 2, fern: 1.6, bush: 1.2, palm: 1 },
            reefs: { coral: 2.5, kelp: 1.4, palm: 0.6 }, open: { kelp: 2, palm: 0.5 }, archipelago: { palm: 1.3 }, swamp: { glowcap: 1.6, reed: 1.6, bubblepod: 1.3 },
            mushrooms: { mushroom: 1.4 }
        };
        const GROVE = { tree: 1, pine: 1, blossom: 1, 'jungle-tree': 1, 'crystal-tree': 1 };
        const DRIFT = { flower: 1, tallflower: 1, 'crystal-flower': 1, 'ice-bloom': 1, 'fire-flower': 1, glowcap: 1, puffball: 1, lily: 1 };
        let plantShares = null;
        function sharesOf() {
            if (plantShares) return plantShares;
            const sk = PLANT_STYLE[style] || {};
            const big = [];
            floraList.forEach(function (sp, si) { if (!isCover(sp)) big.push({ sp: sp, si: si }); });
            const ws = big.map(o => (o.si === 0 ? 2.4 : 1) * (o.sp.abundance || 1) * (sk[o.sp.kind] || 1));
            const tot = ws.reduce((a, b) => a + b, 0) || 1;
            const budget = (PLANT_BUDGET[type + ':' + style] || PLANT_BUDGET[type] || 8) * (big.length < floraList.length ? 0.8 : 1);
            plantShares = big.map((o, i) => ({ sp: o.sp, si: o.si, n: budget * ws[i] / tot / (((FL.kind && FL.kind(o.sp.kind)) || {}).unit || 1) }));
            return plantShares;
        }
        function floraHas(kind) { return floraList.some(sp => sp.kind === kind); }
        let curPlants = null;
        /** Plant triangles a chunk may have (about what the older built-in trees and bushes used). */
        const PLANT_TRIS = { high: 500, standard: 390, low: 240 };
        function plantsIn(S, G, r, x0, z0) {
            const k = D.feat * DENS * (civ ? 0.65 : 1);
            const cap = (PLANT_TRIS[detail] || 480) * Math.min(1.15, DENS) * (civ ? 0.55 : 1) * ({ desert: 0.7, crystal: 0.7, ice: 0.8, rock: 0.7 }[type] || 1);
            let tris = 0;
            const emit = function (tpl, e, c0, c1, glow) { const t = T[tpl] || T.ico0; tris += t.ys.length / 3; (glow ? G : S).add(t, e, c0, c1); };
            const shares = sharesOf();
            const left = shares.map(function (sh) { const v = sh.n * k; return Math.floor(v) + (r() < v - Math.floor(v) ? 1 : 0); });
            // One of each species at a time, round and round, until all are placed or the chunk's plant
            // triangles are spent (so the rarer species are never crowded out by the common ones).
            let more = true;
            while (more && tris < cap) {
                more = false;
                for (let si = 0; si < shares.length && tris < cap; si++) {
                    if (left[si] <= 0) continue;
                    left[si]--; more = true;
                    plantOne(shares[si].sp, shares[si].si, r, x0, z0, emit);
                }
            }
        }
        function plantOne(sp, si, r, x0, z0, emit) {
            const hab = sp.habitat;
            const x = x0 + r() * CS, z = z0 + r() * CS;
            if (cityMask && cityQ(x, z) < 1.05) return;        // cities replace the wild plants
            const h = height(x, z);
            let y = h, size = sp.size * r.range(0.75, 1.2);
            if (hab === 'land' || (hab === 'shore' && !hasSea)) {
                if (hasSea && h < seaH + 0.35) return;
                if (norm(h) > (sp.kind === 'pine' || sp.kind === 'lichen' || sp.kind === 'cushion' || sp.kind === 'snow-moss' ? 0.93 : 0.82)) return;
                if (slopeAt(x, z) > 0.55) return;
                if (GROVE[sp.kind] && is('forest') && n2.fbm(x * 0.012, 5.5, z * 0.012, 2) < -0.08) return;      // trees grow in groves
                if (DRIFT[sp.kind] && n2.fbm(x * 0.021 + si * 7.3, 9.1, z * 0.021, 2) < -0.02) return;          // flowers in drifts
            } else if (hab === 'shore') {
                if (h < seaH + 0.5 || h > seaH + 9 || slopeAt(x, z) > 0.6) return;
            } else if (hab === 'wet') {
                if (!hasSea || h < seaH - 0.5 || h > seaH + 1.4) return;
                y = Math.max(h, seaH - 0.4);
            } else if (hab === 'pond') {
                if (!hasSea || h > seaH - 0.3 || h < seaH - 3) return;
                y = seaH + 0.04;
            } else if (hab === 'sea') {
                if (!hasSea || h > seaH - 1.2) return;
                size = Math.min(16, seaH - h) + 0.02;              // kelp reaches up to the waves
            } else if (hab === 'reef') {
                if (!hasSea || h > seaH - 0.25 || h < seaH - 3.5) return;
                size = (seaH - h) + r.range(0.12, 0.4);            // coral tips just break the surface
            } else if (hab === 'air') {
                if (inLane(x, z, 10)) return;
                y = h + r.range(20, 42);                          // floating plants drift high over the clouds
            }
            if ((hab === 'land' || hab === 'shore') && size > 4.5) size *= shrink(x, z, size, size * 0.3);
            const res = FL.draw(THREE, sp, x, y, z, r() * 6.283, size, emit, r);
            if (hab !== 'air' && res.top > 4.5) tall(x, z, y + res.top, res.r);
            if (curPlants && curPlants.length < 320) curPlants.push(x, z, y + Math.min(res.top, 6) * 0.5, si);
        }

        // ----- ground cover: the small plants near the ship ---------------------------------------------
        // Grass, flowers, ferns, mosses, lichens, little cacti and glow caps are too small to see from far
        // away and too many to merge into every chunk, so each small species is one instanced mesh of
        // copies scattered round the ship; copies left behind move on ahead, out in the haze.
        /** Ground-cover triangles per graphics level (copies = budget / a copy's triangles). */
        const COVER_TRIS = { high: 18000, standard: 12000, low: 5500 };
        const covers = [];
        const cvr = U.rng(U.hash(seed, 'cover'));
        function isCover(sp) { return sp.size <= 1.3 && (sp.habitat === 'land' || sp.habitat === 'pond'); }
        function plantGeometry(sp) {
            const S = new Builder(), G = new Builder();
            FL.draw(THREE, sp, 0, 0, 0, 0, sp.size, function (tpl, e, c0, c1, glow) { (glow ? G : S).add(T[tpl] || T.ico0, e, c0, c1); }, U.rng(U.hash(sp.seed, 'cover-shape')));
            return { s: made(S.build(THREE)), g: made(G.build(THREE)) };
        }
        function clearCover() {
            covers.splice(0).forEach(function (cv) {
                [cv.mesh, cv.glow].forEach(function (m) { if (m) { scene.remove(m); free(m.geometry); if (m.dispose) m.dispose(); } });
            });
        }
        function makeCover() {
            clearCover();
            if (!FLORA_ON) return;
            const list = [];
            floraList.forEach(function (sp, si) { if (isCover(sp)) list.push({ sp: sp, si: si }); });
            if (!list.length) return;
            const sk = PLANT_STYLE[style] || {};
            const ws = list.map(o => (o.si === 0 ? 2 : 1) * (o.sp.abundance || 1) * (sk[o.sp.kind] || 1));
            const tot = ws.reduce((a, b) => a + b, 0) || 1;
            const total = (COVER_TRIS[detail] || 15000) * Math.min(1.15, DENS) * (civ ? 0.55 : 1) * (type === 'rock' ? 0.6 : 1);
            list.forEach(function (o, i) {
                const g = plantGeometry(o.sp);
                const per = Math.max(8, ((g.s ? g.s.attributes.position.count : 0) + (g.g ? g.g.attributes.position.count : 0)) / 3);
                const n = Math.round(U.clamp(total * ws[i] / tot / per, 8, 420));
                const mk = function (geo, mat) {
                    if (!geo) return null;
                    const m = new THREE.InstancedMesh(geo, mat, n);
                    m.frustumCulled = false;
                    if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                    scene.add(m);
                    return m;
                };
                const cv = { sp: o.sp, si: o.si, mesh: mk(g.s, matTerrain), glow: mk(g.g, matGlow), items: [], next: 0 };
                if (!cv.mesh && !cv.glow) return;
                for (let k = 0; k < n; k++) {
                    const it = { x: 0, y: 0, z: 0, on: false, yaw: 0, s: 1 };
                    placeCover(cv, it, true);
                    cv.items.push(it);
                    writeCover(cv, k);
                }
                if (cv.mesh) cv.mesh.instanceMatrix.needsUpdate = true;
                if (cv.glow) cv.glow.instanceMatrix.needsUpdate = true;
                covers.push(cv);
            });
        }
        const cvM = new THREE.Matrix4(), cvQ = new THREE.Quaternion(), cvV = new THREE.Vector3(), cvS = new THREE.Vector3(), cvUp = new THREE.Vector3(0, 1, 0);
        const cvZero = new THREE.Matrix4().makeScale(0, 0, 0);
        function placeCover(cv, it, initial) {
            const sp = cv.sp, r = cvr;
            for (let tries = 0; tries < 3; tries++) {
                lanePoint(initial ? r.range(-15, 150) : r.range(110, 155), r.range(-78, 78), tmpP);
                const x = tmpP.x, z = tmpP.z;
                if (civ && cityQ(x, z) < 1.05) continue;
                const h = height(x, z);
                if (sp.habitat === 'pond') {
                    if (!hasSea || h > seaH - 0.3 || h < seaH - 3) continue;
                    it.y = seaH + 0.04;
                } else {
                    if (hasSea && type !== 'ice' && h < seaH + 0.35) continue;
                    if (hasSea && type === 'ice' && h < seaH + 0.2) continue;
                    if (norm(h) > 0.93 || slopeAt(x, z) > 0.6) continue;
                    if (DRIFT[sp.kind] && n2.fbm(x * 0.021 + cv.si * 7.3, 9.1, z * 0.021, 2) < -0.12) continue;      // flowers grow in drifts
                    it.y = h - 0.02;
                }
                it.x = x; it.z = z; it.on = true; it.yaw = r() * 6.283; it.s = r.range(0.75, 1.25);
                return true;
            }
            it.on = false;
            return false;
        }
        function writeCover(cv, i) {
            const it = cv.items[i];
            let m = cvZero;
            if (it.on) { cvQ.setFromAxisAngle(cvUp, it.yaw); cvM.compose(cvV.set(it.x, it.y, it.z), cvQ, cvS.set(it.s, it.s, it.s)); m = cvM; }
            if (cv.mesh) cv.mesh.setMatrixAt(i, m);
            if (cv.glow) cv.glow.setMatrixAt(i, m);
        }
        /** A few copies a frame: those left behind (or off to the side) move on ahead. */
        function updateCover() {
            for (let c = 0; c < covers.length; c++) {
                const cv = covers[c], n = cv.items.length;
                let dirty = false;
                for (let k = 0; k < 8; k++) {
                    const i = cv.next;
                    cv.next = (i + 1) % n;
                    const it = cv.items[i];
                    if (!it.on || alongOf(it.x, it.z) < -25 || Math.abs(latOf(it.x, it.z)) > 95) { placeCover(cv, it, false); writeCover(cv, i); dirty = true; }
                }
                if (dirty) { if (cv.mesh) cv.mesh.instanceMatrix.needsUpdate = true; if (cv.glow) cv.glow.instanceMatrix.needsUpdate = true; }
            }
        }

        // ----- advanced civilisations: cities and their technology -----------------------------------
        // Rare and grand (NSE.Universe: about one star system in eight), so finding one should feel
        // like an event. How the people build comes from civ.style and what they have from civ.tech;
        // both are in the arrival words (NSE.Universe.civWords), so what is drawn here matches them:
        //   spires    tall glass towers with setbacks and needle spires, sky bridges between them
        //   domes     a great glowing glass dome over each city, little domes round it joined by tubes
        //   arcology  a mountain-sized terraced city in the middle, gardens on every terrace
        //   floating  islands hovering high over the land or sea (gas giants: platforms over the clouds)
        //   organic   tower-trees with leafy platforms and seed-pod homes, vines between them
        //   crystal   faceted crystal towers and glowing shard clusters
        // Technology: maglev rails with trains between cities, drones, sky ships, light beacons, solar
        // farms, patchwork farms, and in the sky a space elevator and the orbital ring (see civSky).
        // Friendly and calm: soft slow pulses only, nothing military, nothing that flashes.
        const CIV_STYLES = ['spires', 'domes', 'arcology', 'floating', 'organic', 'crystal'];
        const civR = U.rng(U.hash('civ-arch', civ ? (civ.seed || 1) : 0, world.seed));
        const CSTYLE = !civ ? null : gas ? 'floating' : CIV_STYLES.indexOf(civ.style) >= 0 ? civ.style : civR.pick(CIV_STYLES);
        const ARCH = CSTYLE;
        const floating = CSTYLE === 'floating';
        const TECH = {};
        if (civ) {
            (Array.isArray(civ.tech) ? civ.tech : ['maglev', 'drones', 'skyships', 'beacons', 'solar', 'farms'].filter(() => civR() < 0.5)).forEach(t => { TECH[t] = true; });
            if (gas || floating) TECH.maglev = false;          // no rails in the clouds or between hovering islands
            if (gas) TECH.farms = false;                         // (gas giants' solar panels ring their cloud platforms instead of fields)
        }
        const civHsl = (h, s, l) => lin(U.toHex(U.hsl(h, s, l)));
        const civHue = civR.range(0, 360);
        // The world's own hue, so crystal cities can shine in the colours opposite it.
        const worldHue = (function () { const c = new THREE.Color(pal.mid[0], pal.mid[1], pal.mid[2]), h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return h.h * 360; })();
        let civWalls, civRoof;
        switch (CSTYLE) {
            case 'spires': civWalls = [0, 1, 2].map(() => civHsl(civR.range(185, 228), civR.range(0.18, 0.38), civR.range(0.55, 0.72))); civRoof = civHsl(civHue, 0.35, 0.8); break;
            case 'domes': civWalls = [0, 1, 2].map(() => civHsl(civR.range(0, 360), civR.range(0.12, 0.28), civR.range(0.8, 0.9))); civRoof = civHsl(civHue, 0.5, 0.68); break;
            case 'arcology': civWalls = [0, 1, 2].map(() => civHsl(civR.range(22, 44), civR.range(0.22, 0.38), civR.range(0.62, 0.76))); civRoof = civHsl(civR.range(95, 140), 0.45, 0.42); break;
            case 'organic': civWalls = [0, 1, 2].map(() => civHsl(civR.range(18, 42), civR.range(0.22, 0.34), civR.range(0.3, 0.42))); civRoof = civHsl(civR.range(95, 165), civR.range(0.45, 0.6), 0.44); break;
            case 'crystal': { const ch = worldHue + 180 + civR.range(-40, 40); civWalls = [0, 1, 2].map(() => civHsl(ch + civR.range(-25, 25), civR.range(0.5, 0.75), civR.range(0.7, 0.84))); civRoof = civHsl(ch, 0.6, 0.9); break; }
            default: civWalls = [0, 1, 2].map(() => civHsl(civR.range(195, 235), civR.range(0.06, 0.16), civR.range(0.8, 0.9))); civRoof = civHsl(civHue, 0.5, 0.66);
        }
        const civTrim = civ ? mixc(winCol, WHITE, 0.45) : WHITE;
        const civSilver = lin('#d0d6e0');
        const pave = mixc(lin('#c8ccd4'), civWalls[0], 0.25);
        const podCols = [civHsl(civHue + 40, 0.55, 0.78), civHsl(civHue + 180, 0.5, 0.8), civHsl(48, 0.7, 0.78)];
        const leafy = (type === 'earth' || type === 'ocean' || type === 'toxic') ? scl(pal.mid, 0.75) : mixc(civRoof, pal.mid, 0.5);
        const CITY = { name: 'city', size: gas ? 360 : 300, prob: 0.95, r0: 58, r1: 88 };
        const PORT = { name: 'port', size: 520, prob: 1, r0: 16, r1: 22 };
        const plans = new Map();
        /** Fewer buildings at the lower graphics levels (GRAPHICS-QUALITY.md). */
        const CITY_DENS = { high: 1, standard: 0.85, low: 0.65 }[detail] || 0.85;
        let domesBuilt = 0, megasBuilt = 0, islandsBuilt = 0, beaconsBuilt = 0;

        /** Solar fields round a city: three rectangles of panels between 1.3 and 1.5 of its radius. */
        const SOLAR_N = TECH.solar && !gas ? (detail === 'low' ? 1 : detail === 'standard' ? 2 : 3) : 0;
        const fieldTmp = [];
        function solarFields(gx, gz, cx, cz, cr, out) {
            out.length = 0;
            const h = U.hash(seed, 'solar', gx, gz);
            for (let i = 0; i < SOLAR_N; i++) {
                const a = i * 2.094 + ((h >>> (i * 8)) & 255) / 255 - 0.5;
                const dd = cr * (1.3 + ((h >>> (i * 3 + 24)) & 3) / 3 * 0.2);
                out.push({ x: cx + Math.cos(a) * dd, z: cz + Math.sin(a) * dd, a: a });
            }
            return out;
        }
        function inSolar(x, z, gx, gz, c) {
            solarFields(gx, gz, c.x, c.z, c.r, fieldTmp);
            for (let i = 0; i < fieldTmp.length; i++) {
                const f = fieldTmp[i], ca = Math.cos(f.a), sa = Math.sin(f.a);
                const u = (x - f.x) * ca + (z - f.z) * sa, v = (z - f.z) * ca - (x - f.x) * sa;
                if (u > -12 && u < 12 && v > -18 && v < 18) return true;
            }
            return false;
        }
        /**
         * How deep inside a city a point is: q < 1 inside (0 = its middle), Infinity when far from any.
         * Wild scenery and wildlife keep out of q < ~1.05; solar fields count as inside. Floating cities
         * hover above wild land, so under them it stays wild.
         */
        function cityQ(x, z) {
            if (!civ) return Infinity;
            const gx = Math.floor(x / CITY.size), gz = Math.floor(z / CITY.size);
            let best = Infinity;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const c = cellAt(CITY, gx + i, gz + j);
                if (!c) continue;
                const q = Math.hypot(x - c.x, z - c.z) / c.r;
                if (!floating && q < best) best = q;
                if (SOLAR_N && q > 1.1 && q < 1.85 && best > 0.97 && inSolar(x, z, gx + i, gz + j, c)) best = 0.97;
            }
            return best;
        }
        /** The nearest city's middle, radius and field-grid angle (farms), q = distance / radius. */
        const ncOut = { q: Infinity, x: 0, z: 0, r: 1, a: 0 };
        function nearCity(x, z) {
            ncOut.q = Infinity;
            if (!civ) return ncOut;
            const gx = Math.floor(x / CITY.size), gz = Math.floor(z / CITY.size);
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const c = cellAt(CITY, gx + i, gz + j);
                if (!c) continue;
                const q = Math.hypot(x - c.x, z - c.z) / c.r;
                if (q < ncOut.q) { ncOut.q = q; ncOut.x = c.x; ncOut.z = c.z; ncOut.r = c.r; ncOut.a = c.k * 3.1416; }
            }
            return ncOut;
        }
        const groundOrSea = (x, z) => (gas ? height(x, z) : Math.max(height(x, z), hasSea ? seaH + 0.6 : -Infinity));
        /** The highest (hi) or lowest ground or sea under a disc. */
        function groundAround(x, z, r, hi) {
            let m = groundOrSea(x, z);
            for (let k = 0; k < 8; k++) {
                const a = k * 0.785;
                const g1 = groundOrSea(x + Math.cos(a) * r, z + Math.sin(a) * r), g2 = groundOrSea(x + Math.cos(a) * r * 0.55, z + Math.sin(a) * r * 0.55);
                m = hi ? Math.max(m, g1, g2) : Math.min(m, g1, g2);
            }
            return m;
        }
        /** One building of the city's style (where = 'island' for the hovering islands and platforms). */
        function kindOf(r, q, where) {
            const big = 1 - 0.6 * q;
            switch (where || CSTYLE) {
                case 'spires': { const u = r(); return u < 0.55 ? { kind: 'slab', rad: r.range(3.4, 5.6), d: r.range(3, 5), h: r.range(34, 92) * big, rot: r.range(-0.3, 0.3) } : u < 0.88 ? { kind: 'needle', rad: r.range(2.6, 4.4), h: r.range(36, 82) * big } : { kind: 'tower', rad: r.range(2.4, 3.8), h: r.range(22, 48) * big }; }
                case 'arcology': return r() < 0.7 ? { kind: 'zig', rad: r.range(6, 9.5), tiers: r.int(2, 4), h: 0 } : { kind: 'tower', rad: r.range(2.4, 3.6), h: r.range(16, 30) * big };
                case 'organic': return r() < 0.62 ? { kind: 'tree', rad: r.range(2.2, 3.4), h: r.range(30, 62) * big + 8, plats: r.int(2, 3), rot: r() * 6.28 } : { kind: 'sprout', rad: r.range(2, 3.2), h: r.range(5, 10) };
                case 'crystal': return r() < 0.55 ? { kind: 'prism', rad: r.range(2.6, 4.6), h: r.range(24, 70) * big + 6, rot: r() * 6.28 } : { kind: 'shards', rad: r.range(5, 9), h: r.range(12, 30) * (0.6 + 0.4 * big), n: r.int(3, 5), rot: r() * 6.28 };
                case 'domes': return r() < 0.5 ? { kind: 'house', rad: r.range(3, 6), h: 0 } : { kind: 'pod', rad: r.range(2.2, 3.6), h: r.range(6, 16) };
                default: {
                    const u = r();
                    return u < 0.35 ? { kind: 'pod', rad: r.range(2.2, 3.6), h: r.range(8, 20) } : u < 0.6 ? { kind: 'tower', rad: r.range(2, 3.2), h: r.range(10, 22) }
                        : u < 0.8 ? { kind: 'needle', rad: r.range(2, 3.2), h: r.range(14, 28) } : { kind: 'dome', rad: r.range(4, 7), h: 0 };
                }
            }
        }
        function cityPlan(gx, gz) {
            const key = gx + ',' + gz;
            if (plans.has(key)) return plans.get(key);
            const c0 = cellAt(CITY, gx, gz);
            let plan = null;
            if (c0) {
                const c = { x: c0.x, z: c0.z, r: c0.r, k: c0.k };
                const r = U.rng(U.hash(seed, 'cityplan', gx, gz));
                plan = {
                    id: 'c' + key, gx: gx, gz: gz, x: c.x, z: c.z, r: c.r, k: c.k, b: [], bridges: [], masts: [], plats: [], beacons: [], domelets: [],
                    dome: null, mega: null, gy: groundOrSea(c.x, c.z), tLo: 24, tHi: 46, tMin: 0
                };
                if (floating) {
                    // Islands (gas giants: platforms) hovering high over the land, the sea or the clouds.
                    const np = r.int(3, 5);
                    for (let i = 0; i < np; i++) {
                        let pl = null;
                        for (let tries = 0; tries < 8 && !pl; tries++) {
                            const a = r() * 6.28, dd = plan.plats.length ? r.range(36, c.r * 0.92) : 0, pr = gas ? r.range(15, 25) : r.range(14, 23);
                            const x = c.x + Math.cos(a) * dd, z = c.z + Math.sin(a) * dd;
                            if (plan.plats.some(o => Math.hypot(o.x - x, o.z - z) < o.r + pr + 8)) continue;
                            const top = gas ? height(x, z) + r.range(32, 44) : groundAround(x, z, pr * 1.1, true) + r.range(40, 52) + pr * 1.15;
                            pl = { x: x, z: z, r: pr, top: top, rot: r() * 6.28, fall: !gas && (type === 'earth' || type === 'ocean') && r() < 0.6 };
                        }
                        if (!pl) continue;
                        plan.plats.push(pl);
                        const nb = r.int(3, 6);
                        for (let k = 0; k < nb; k++) {
                            const a2 = r() * 6.28, d2 = k ? r.range(0.25, 0.66) * pl.r : 0;
                            const b = kindOf(r, k ? 0.6 : 0.1, 'island');
                            if (b.kind === 'dome') b.rad = Math.min(b.rad, pl.r * 0.42);
                            b.x = pl.x + Math.cos(a2) * d2; b.z = pl.z + Math.sin(a2) * d2; b.plat = plan.plats.length - 1; b.wall = r.pick(civWalls);
                            plan.b.push(b);
                        }
                        if (plan.plats.length > 1) plan.bridges.push({ pa: plan.plats.length - 1, pb: 0 });
                    }
                    const t0 = plan.plats.length ? plan.plats[0].top - plan.gy : 40;
                    if (gas) { plan.tLo = t0 + 6; plan.tHi = t0 + 22; } else { plan.tLo = t0 - 8; plan.tHi = t0 + 14; }
                    if (TECH.beacons && plan.plats.length) {
                        const p0 = plan.plats[0], a = r() * 6.28;
                        plan.beacons.push({ plat: 0, x: p0.x + Math.cos(a) * p0.r * 0.74, z: p0.z + Math.sin(a) * p0.r * 0.74, h: r.range(20, 28), top: null });
                    }
                } else {
                    if (CSTYLE === 'domes') {
                        // A great glass dome over the middle of the city; little domes round it, joined by tubes.
                        const R = c.r * 0.62;
                        plan.dome = { R: R, H: R * 0.5, base: groundAround(c.x, c.z, R, false) - 0.6 };
                        plan.tLo = plan.dome.base - plan.gy + plan.dome.H + 6; plan.tHi = plan.tLo + 16;
                        const nd = r.int(2, 4);
                        for (let i = 0; i < nd; i++) {
                            const a = i / nd * 6.283 + r.range(-0.4, 0.4), dr = r.range(8, 12.5), dd = R + dr + r.range(5, 9);
                            const x = c.x + Math.cos(a) * dd, z = c.z + Math.sin(a) * dd;
                            plan.domelets.push({ x: x, z: z, r: dr, a: a, dd: dd, base: groundAround(x, z, dr, false) - 0.4 });
                        }
                        plan.b.push({ kind: 'needle', rad: 3.4, h: Math.max(8, plan.dome.H - 6 - (plan.gy - plan.dome.base)), x: c.x, z: c.z, inDome: true, wall: civWalls[0] });
                    }
                    if (CSTYLE === 'arcology') {
                        plan.mega = { x: c.x, z: c.z, rad: c.r * 0.4, tiers: r.int(6, 9), th: r.range(7, 8.5), rot: r() * 0.8 };
                        plan.tMin = plan.mega.rad * 1.3 + 8;
                    }
                    if (CSTYLE === 'organic') plan.b.push({ kind: 'tree', rad: r.range(5, 6.5), h: r.range(68, 88), plats: 4, rot: r() * 6.28, x: c.x, z: c.z, wall: civWalls[0], great: true });
                    const g = { organic: r.range(24, 29), crystal: r.range(16, 20), domes: r.range(13, 16) }[CSTYLE] || r.range(15, 19);
                    const n = Math.ceil(c.r / g);
                    for (let gj = -n; gj <= n; gj++) for (let gi = -n; gi <= n; gi++) {
                        const x = c.x + gi * g + r.range(-3, 3), z = c.z + gj * g + r.range(-3, 3);
                        const dc = Math.hypot(x - c.x, z - c.z), qd = dc / c.r;
                        if (qd > 1 || r() > (0.66 - qd * 0.38) * CITY_DENS) continue;
                        if ((plan.mega && dc < plan.mega.rad * 1.3) || (CSTYLE === 'organic' && dc < 26)) continue;
                        let b;
                        if (plan.dome) {
                            const D0 = plan.dome;
                            if (dc < 9 || (dc > D0.R - 5 && dc < D0.R + 3)) continue;           // the middle spire, and the dome's edge
                            b = kindOf(r, qd, 'domes');
                            if (dc < D0.R) {
                                // Under the glass: everything stays below the dome's curve.
                                const cap = D0.H * Math.sqrt(Math.max(0, 1 - (dc / D0.R) * (dc / D0.R))) - 3 - (groundOrSea(x, z) - D0.base);
                                if (b.kind === 'pod') b.h = Math.min(b.h, cap - b.rad * 2.7);
                                else b.rad = Math.min(b.rad, cap / 0.75);
                                if (b.kind === 'pod' ? b.h < 3 : b.rad < 2) continue;
                                b.inDome = true;
                            } else if (plan.domelets.some(dl => Math.hypot(dl.x - x, dl.z - z) < dl.r + 4 || Math.abs((x - c.x) * Math.sin(dl.a) - (z - c.z) * Math.cos(dl.a)) < 4 && (x - c.x) * Math.cos(dl.a) + (z - c.z) * Math.sin(dl.a) > 0)) continue;
                        } else b = kindOf(r, qd);
                        b.x = x; b.z = z; b.wall = r.pick(civWalls);
                        plan.b.push(b);
                    }
                    // Sky bridges between neighbouring tall towers (vines between the tower-trees, beams of light between crystals).
                    if (!plan.dome) {
                        for (let i = 0; i < plan.b.length; i++) {
                            const A = plan.b[i];
                            if (!(A.h >= 18) || r() < 0.45) continue;
                            let best = -1, bd = g * 2.3;
                            for (let j = i + 1; j < plan.b.length; j++) {
                                const B = plan.b[j];
                                if (!(B.h >= 18)) continue;
                                const dd = Math.hypot(A.x - B.x, A.z - B.z);
                                if (dd < bd) { bd = dd; best = j; }
                            }
                            if (best >= 0) plan.bridges.push({ a: i, b: best, f: r.range(0.4, 0.7) });
                        }
                    }
                    const nm = r.int(1, 3);
                    for (let i = 0; i < nm; i++) {
                        const a = r() * 6.28, qm = r.range(0.75, 1.05);
                        plan.masts.push({ x: c.x + Math.cos(a) * qm * c.r, z: c.z + Math.sin(a) * qm * c.r, h: r.range(28, 46) });
                    }
                    if (TECH.beacons) {
                        const nb = r.int(1, 2), a0 = r() * 6.28;
                        for (let i = 0; i < nb; i++) {
                            const a = a0 + i / nb * 6.283 + r.range(-0.3, 0.3), qb = r.range(0.96, 1.1);
                            const x = c.x + Math.cos(a) * qb * c.r, z = c.z + Math.sin(a) * qb * c.r;
                            if (plan.domelets.some(dl => Math.hypot(dl.x - x, dl.z - z) < dl.r + 6)) continue;
                            plan.beacons.push({ x: x, z: z, h: r.range(38, 58), top: null });
                        }
                    }
                }
            }
            plans.set(key, plan);
            if (plans.size > 96) plans.delete(plans.keys().next().value);
            return plan;
        }
        /** Every city whose ground overlaps a rectangle. */
        function citiesNear(x0, z0, x1, z1, out) {
            const m = CITY.r1 * 1.6;
            const g0x = Math.floor((x0 - m) / CITY.size), g1x = Math.floor((x1 + m) / CITY.size);
            const g0z = Math.floor((z0 - m) / CITY.size), g1z = Math.floor((z1 + m) / CITY.size);
            for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
                const pl = cityPlan(gx, gz);
                const e = pl ? pl.r * 1.6 : 0;           // (solar fields, beacons and little domes reach past the edge)
                if (pl && pl.x + e > x0 - 10 && pl.x - e < x1 + 10 && pl.z + e > z0 - 10 && pl.z - e < z1 + 10) out.push(pl);
            }
            return out;
        }
        const WIN_K = { high: 1, standard: 1.25, low: 1.8 }[detail] || 1.25;      // fewer lit window bands at the lower graphics levels
        const winBands = (h) => Math.max(3.4, h / 5.5) * WIN_K;
        let cityBuilt = 0;
        function building(S, G, b, y) {
            const w0 = scl(b.wall, 0.82), w1 = b.wall, glow = winCol, roof = civRoof;
            switch (b.kind) {
                case 'box': {
                    put(S, T.box, b.x, y, b.z, b.rad * 2, b.h, b.d * 2, 0, b.rot || 0, 0, w0, w1);
                    for (let f = 3; f < b.h - 1; f += winBands(b.h)) put(G, T.box, b.x, y + f, b.z, b.rad * 2.04, 0.75, b.d * 2.04, 0, b.rot || 0, 0, glow, glow);
                    put(S, T.cap, b.x, y + b.h, b.z, Math.min(b.rad, b.d) * 0.8, Math.min(b.rad, b.d) * 0.6, Math.min(b.rad, b.d) * 0.8, 0, 0, 0, roof, mixc(roof, WHITE, 0.3));
                    tall(b.x, b.z, y + b.h + 2, Math.max(b.rad, b.d) * 1.4);
                    break;
                }
                case 'slab': {
                    // A glass tower that steps in twice as it rises, with a mast on top.
                    const g0 = scl(w1, 0.72), g1 = mixc(w1, WHITE, 0.28), rot = b.rot || 0;
                    const hs = [b.h * 0.6, b.h * 0.27, b.h * 0.13], ws = [1, 0.74, 0.5];
                    let yy = y;
                    for (let s = 0; s < 3; s++) {
                        const wx = b.rad * 2 * ws[s], wz = b.d * 2 * ws[s];
                        put(S, T.box, b.x, yy, b.z, wx, hs[s], wz, 0, rot, 0, g0, g1);
                        for (let f = 2.6; f < hs[s] - 0.8; f += winBands(b.h) * 0.8) put(G, T.box, b.x, yy + f, b.z, wx * 1.02, 0.45, wz * 1.02, 0, rot, 0, glow, glow);
                        yy += hs[s];
                    }
                    put(S, T.cone6, b.x, yy, b.z, 0.35, b.h * 0.12, 0.35, 0, 0, 0, civSilver, WHITE);
                    put(G, T.octa, b.x, yy + b.h * 0.12 + 0.4, b.z, 0.5, 0.8, 0.5, 0, 0, 0, glow, WHITE);
                    tall(b.x, b.z, yy + b.h * 0.12 + 1.5, Math.max(b.rad, b.d) * 1.4);
                    break;
                }
                case 'pod':
                    put(S, T.cyl8, b.x, y, b.z, b.rad, b.h, b.rad, 0, 0, 0, w0, w1);
                    put(S, T.ball, b.x, y + b.h + b.rad * 1.1, b.z, b.rad * 1.7, b.rad * 1.5, b.rad * 1.7, 0, 0, 0, mixc(roof, w1, 0.4), mixc(roof, WHITE, 0.4));
                    for (let f = 3; f < b.h - 1; f += winBands(b.h)) put(G, T.windows, b.x, y + f, b.z, b.rad * 1.03, 0.9, b.rad * 1.03, 0, f * 0.7, 0, glow, glow);
                    put(G, T.windows, b.x, y + b.h + b.rad * 1.1, b.z, b.rad * 1.72, 0.7, b.rad * 1.72, 0, 0, 0, glow, glow);
                    tall(b.x, b.z, y + b.h + b.rad * 2.6, b.rad * 1.7);
                    break;
                case 'needle':
                    put(S, T.cone6, b.x, y, b.z, b.rad, b.h, b.rad, 0, 0, 0, w0, mixc(w1, WHITE, 0.3));
                    for (let f = 4; f < b.h * 0.8; f += winBands(b.h) * 1.3) { const rr = b.rad * (1 - f / b.h) * 1.06; put(G, T.windows, b.x, y + f, b.z, rr, 0.8, rr, 0, f, 0, glow, glow); }
                    put(G, T.octa, b.x, y + b.h + 0.6, b.z, 0.7, 1.2, 0.7, 0, 0, 0, glow, WHITE);
                    tall(b.x, b.z, y + b.h + 1.8, b.rad);
                    break;
                case 'tower':
                    put(S, T.cyl8, b.x, y, b.z, b.rad, b.h, b.rad, 0, 0, 0, w0, w1);
                    put(S, T.cone6, b.x, y + b.h - 0.1, b.z, b.rad * 1.15, b.rad * 2.2, b.rad * 1.15, 0, 0, 0, roof, mixc(roof, WHITE, 0.3));
                    for (let f = 3; f < b.h - 1; f += winBands(b.h)) put(G, T.windows, b.x, y + f, b.z, b.rad * 1.03, 0.9, b.rad * 1.03, 0, f * 0.7, 0, glow, glow);
                    tall(b.x, b.z, y + b.h + b.rad * 2.2, b.rad * 1.2);
                    break;
                case 'zig': {
                    let w = b.rad, yy = y;
                    for (let t = 0; t < b.tiers; t++) {
                        const th = 4.5;
                        put(S, T.box, b.x, yy, b.z, w * 2, th, w * 2, 0, 0, 0, scl(w1, 0.86 + t * 0.04), w1);
                        put(G, T.box, b.x, yy + th * 0.55, b.z, w * 2.03, 0.6, w * 2.03, 0, 0, 0, glow, glow);
                        if (CSTYLE === 'arcology') put(S, T.box, b.x, yy + th, b.z, w * 1.9, 0.4, w * 1.9, 0, 0, 0, scl(roof, 0.8), roof);    // a terrace garden
                        yy += th; w *= 0.72;
                    }
                    put(G, T.octa, b.x, yy + 0.8, b.z, w * 0.8, 1.4, w * 0.8, 0, 0, 0, glow, WHITE);
                    tall(b.x, b.z, yy + 2, b.rad * 1.2);
                    break;
                }
                case 'tree': {
                    // A tower grown like a giant tree: flared roots, a trunk, leafy platforms with seed-pod homes.
                    const bark0 = scl(w1, 0.75), leaf0 = scl(roof, 0.72), leaf1 = mixc(roof, WHITE, 0.12);
                    put(S, T.cone6, b.x, y - 0.6, b.z, b.rad * 2.5, b.h * 0.2, b.rad * 2.5, 0, b.rot, 0, bark0, w1);
                    put(S, T.cyl8, b.x, y, b.z, b.rad * 0.9, b.h, b.rad * 0.9, 0, b.rot, 0, bark0, w1);
                    for (let f = 6; f < b.h * 0.92; f += 9 * WIN_K) put(G, T.windows, b.x, y + f, b.z, b.rad * 0.93, 0.7, b.rad * 0.93, 0, f, 0, glow, glow);
                    const np = b.plats || 2;
                    for (let k = 0; k < np; k++) {
                        const yy = y + b.h * (0.38 + 0.5 * k / Math.max(1, np - 1)), pr = b.rad * (3.3 - k * 0.45);
                        put(S, T.disc, b.x, yy - 0.9, b.z, pr, 0.9, pr, 0, b.rot + k, 0, bark0, w1);
                        put(S, T.ico0, b.x, yy + pr * 0.22, b.z, pr * 0.95, pr * 0.45, pr * 0.95, 0, b.rot + k * 2, 0, leaf0, leaf1);
                        put(G, T.windows, b.x, yy - 0.55, b.z, pr * 1.01, 0.5, pr * 1.01, 0, k, 0, glow, glow);
                        for (let p = 0; p < 2; p++) {
                            const a = b.rot + k * 1.3 + p * 3.1416, px = b.x + Math.cos(a) * pr * 0.78, pz = b.z + Math.sin(a) * pr * 0.78;
                            const pc = podCols[(k + p) % podCols.length];
                            put(S, T.ico0, px, yy - 2.6, pz, 1.7, 2.1, 1.7, 0, a, 0, scl(pc, 0.85), mixc(pc, WHITE, 0.3));
                            put(G, T.octa, px, yy - 2.8, pz, 0.6, 0.6, 0.6, 0, 0, 0, glow, glow);
                        }
                    }
                    put(S, T.ico0, b.x, y + b.h + b.rad * 0.8, b.z, b.rad * 3.7, b.rad * 2.2, b.rad * 3.7, 0, b.rot, 0, leaf0, leaf1);
                    tall(b.x, b.z, y + b.h + b.rad * 2.9, b.rad * 3.6);
                    break;
                }
                case 'sprout':
                    put(S, T.cyl8, b.x, y, b.z, b.rad * 0.55, b.h, b.rad * 0.55, 0, 0, 0, scl(w1, 0.75), w1);
                    put(S, T.ball, b.x, y + b.h + b.rad * 0.6, b.z, b.rad * 1.5, b.rad * 1.15, b.rad * 1.5, 0, 0, 0, mixc(w1, WHITE, 0.45), mixc(roof, WHITE, 0.45));
                    put(S, T.cap, b.x, y + b.h + b.rad * 1.5, b.z, b.rad * 1.2, b.rad * 0.7, b.rad * 1.2, 0, 0, 0, scl(roof, 0.75), roof);
                    put(G, T.windows, b.x, y + b.h + b.rad * 0.55, b.z, b.rad * 1.52, 0.5, b.rad * 1.52, 0, 0, 0, glow, glow);
                    tall(b.x, b.z, y + b.h + b.rad * 2.3, b.rad * 1.5);
                    break;
                case 'prism': {
                    // A faceted crystal tower: lighter towards its point, glowing bands and a glowing tip.
                    const c0 = scl(w1, 0.68), c1 = mixc(w1, WHITE, 0.42);
                    put(S, T.cyl5, b.x, y, b.z, b.rad, b.h * 0.8, b.rad, 0, b.rot, 0, c0, c1);
                    put(S, T.cone6, b.x, y + b.h * 0.8, b.z, b.rad * 1.02, b.h * 0.2, b.rad * 1.02, 0, b.rot, 0, c1, WHITE);
                    for (let f = 0.22; f < 0.78; f += 0.18) put(G, T.cyl5, b.x, y + b.h * f, b.z, b.rad * 1.015, 0.5, b.rad * 1.015, 0, b.rot, 0, mixc(glow, c1, 0.4), mixc(glow, c1, 0.4));
                    put(G, T.octa, b.x, y + b.h + 0.9, b.z, 0.9, 1.4, 0.9, 0, b.rot, 0, glow, WHITE);
                    tall(b.x, b.z, y + b.h + 2.2, b.rad * 1.1);
                    break;
                }
                case 'shards': {
                    // A cluster of leaning crystals, each glowing at its heart.
                    const sr = U.rng(U.hash(seed, 'shards', b.x | 0, b.z | 0));
                    const c0 = scl(w1, 0.7), c1 = mixc(w1, WHITE, 0.45);
                    for (let k = 0; k < (b.n || 3); k++) {
                        const a = b.rot + k * 2.4, d = k ? b.rad * sr.range(0.3, 0.6) : 0;
                        const hk = b.h * (k ? sr.range(0.45, 0.85) : 1), rk = b.rad * sr.range(0.24, 0.36);
                        const rx = k ? Math.sin(a) * 0.3 : 0, rz = k ? -Math.cos(a) * 0.3 : 0;
                        const px = b.x + Math.cos(a) * d, pz = b.z + Math.sin(a) * d;
                        put(S, T.octa, px, y + hk * 0.42, pz, rk, hk * 0.5, rk, rx, a, rz, c0, c1);
                        put(G, T.octa, px, y + hk * 0.42, pz, rk * 0.32, hk * 0.2, rk * 0.32, rx, a, rz, glow, glow);
                    }
                    tall(b.x, b.z, y + b.h + 1, b.rad);
                    break;
                }
                case 'house':
                    put(S, T.hemi, b.x, y, b.z, b.rad, b.rad * 0.75, b.rad, 0, 0, 0, scl(w1, 0.92), mixc(w1, WHITE, 0.35));
                    put(G, T.windows, b.x, y + 0.9, b.z, b.rad * 1.005, 0.7, b.rad * 1.005, 0, 0, 0, glow, glow);
                    put(G, T.octa, b.x, y + b.rad * 0.75 + 0.3, b.z, 0.5, 0.6, 0.5, 0, 0, 0, glow, WHITE);
                    tall(b.x, b.z, y + b.rad * 0.75, b.rad);
                    break;
                default: {      // dome
                    put(S, T.hemi, b.x, y, b.z, b.rad, b.rad * 0.75, b.rad, 0, 0, 0, scl(w1, 0.9), mixc(w1, WHITE, 0.35));
                    put(G, T.windows, b.x, y + 1, b.z, b.rad * 1.005, 0.9, b.rad * 1.005, 0, 0, 0, glow, glow);
                    tall(b.x, b.z, y + b.rad * 0.75, b.rad);
                }
            }
            cityBuilt++;
        }
        const tallOf = b => b.kind === 'dome' || b.kind === 'house' ? b.rad * 0.75 : b.kind === 'zig' ? b.tiers * 4.5 : b.h + 4;
        /** A hovering island: a rocky underside tapering to a glowing crystal, a lit ring, maybe a waterfall. */
        const isleTop = gas ? [lin('#9aa4b4'), lin('#e0e6f0')] : (type === 'earth' || type === 'ocean' || type === 'toxic') ? [scl(pal.mid, 0.8), mixc(pal.mid, WHITE, 0.15)] : [scl(pal.high, 0.85), mixc(pal.high, WHITE, 0.2)];
        const rockA = scl(pal.low, 0.9), rockB = mixc(pal.mid, pal.high, 0.5);
        function island(S, G, pt) {
            const y = pt.top;
            put(S, T.disc, pt.x, y - 2.6, pt.z, pt.r, 2.6, pt.r, 0, pt.rot, 0, isleTop[0], isleTop[1]);
            if (gas) {
                // Cloud-city platforms: a bulb of lifting gas under each, ringed with light.
                put(S, T.ball, pt.x, y - 2.8 - pt.r * 0.32, pt.z, pt.r * 0.62, pt.r * 0.42, pt.r * 0.62, 0, 0, 0, lin('#8a94a8'), lin('#c8d0dc'));
                put(G, T.windows, pt.x, y - 1.9, pt.z, pt.r * 1.01, 0.6, pt.r * 1.01, 0, 0, 0, winCol, winCol);
                put(G, T.windows, pt.x, y - 2.8 - pt.r * 0.32, pt.z, pt.r * 0.63, 0.6, pt.r * 0.63, 0, 0, 0, winCol, winCol);
                put(G, T.octa, pt.x, y - 3.4 - pt.r * 0.74, pt.z, 1.4, 1.6, 1.4, 0, 0, 0, winCol, WHITE);
                if (TECH.solar) {
                    // Solar panels round the platform's rim, tipped up to the sun.
                    for (let k = 0; k < 10; k++) {
                        const a = pt.rot + k / 10 * 6.283, px = pt.x + Math.cos(a) * pt.r * 0.86, pz = pt.z + Math.sin(a) * pt.r * 0.86;
                        putR(S, T.box, px, y + 0.2, pz, 2.2, 0.12, 3, 0, -a, 0.42, PANEL0, PANEL1);
                    }
                }
            } else {
                const deep = pt.r * 1.15;
                put(S, T.cone6, pt.x, y - 2.5, pt.z, pt.r * 0.96, deep, pt.r * 0.96, Math.PI, pt.rot, 0, rockB, scl(rockA, 0.7));
                const a = pt.rot + 1.3;
                put(S, T.cone6, pt.x + Math.cos(a) * pt.r * 0.38, y - 2.8, pt.z + Math.sin(a) * pt.r * 0.38, pt.r * 0.5, deep * 0.72, pt.r * 0.5, Math.PI, pt.rot * 2, 0, rockB, scl(rockA, 0.75));
                put(G, T.windows, pt.x, y - 3.7, pt.z, pt.r * 0.88, 0.7, pt.r * 0.88, 0, 0, 0, winCol, winCol);
                put(G, T.octa, pt.x, y - 2.5 - deep - 1.4, pt.z, 1.5, 2.4, 1.5, 0, 0, 0, winCol, WHITE);
                if (pt.fall) {
                    const fa = pt.rot - 0.8, fx = pt.x + Math.cos(fa) * pt.r * 0.9, fz = pt.z + Math.sin(fa) * pt.r * 0.9;
                    put(S, T.cone6, fx, y - 0.6, fz, 1.2, 24, 1.2, Math.PI, 0, 0, mixc(pal.sea, WHITE, 0.75), skyHor);
                }
                const tr = U.rng(U.hash(seed, 'isle', pt.x | 0, pt.z | 0));
                for (let k = 0; k < 4; k++) {
                    const ta = tr() * 6.28, td = tr.range(0.74, 0.92) * pt.r, s = tr.range(1.1, 2);
                    put(S, T.ico0, pt.x + Math.cos(ta) * td, y + s * 0.5, pt.z + Math.sin(ta) * td, s * 1.2, s * 1.4, s * 1.2, 0, tr() * 6, 0, scl(leafy, 0.8), leafy);
                }
            }
            islandsBuilt++;
        }
        /** The great dome's frame (its glass is one see-through shell from the dome pool, near the ship). */
        function domeParts(S, G, pl) {
            const D0 = pl.dome, y = D0.base;
            put(S, T.cyl8, pl.x, y - 1.2, pl.z, D0.R * 1.02, 2.8, D0.R * 1.02, 0, 0, 0, scl(pave, 0.75), pave);
            put(G, T.windows, pl.x, y + 0.9, pl.z, D0.R * 1.025, 0.8, D0.R * 1.025, 0, 0, 0, winCol, winCol);
            [0.38, 0.72].forEach(function (f) {
                const rr = D0.R * Math.sqrt(1 - f * f);
                put(G, T.windows, pl.x, y + D0.H * f - 0.2, pl.z, rr * 1.004, 0.35, rr * 1.004, 0, f * 3, 0, civTrim, civTrim);
            });
            put(G, T.octa, pl.x, y + D0.H + 0.9, pl.z, 1.2, 1.6, 1.2, 0, 0, 0, winCol, WHITE);
            // The ship climbs over the glass, following its curve.
            tall(pl.x, pl.z, y + D0.H * 0.55, D0.R);
            tall(pl.x, pl.z, y + D0.H * 0.86, D0.R * 0.72);
            tall(pl.x, pl.z, y + D0.H + 1.2, D0.R * 0.42);
            domesBuilt++;
        }
        function domelet(S, G, pl, dl) {
            put(S, T.hemi, dl.x, dl.base, dl.z, dl.r, dl.r * 0.7, dl.r, 0, 0, 0, scl(civWalls[1], 0.92), mixc(civWalls[1], WHITE, 0.4));
            put(G, T.windows, dl.x, dl.base + 1, dl.z, dl.r * 1.005, 0.8, dl.r * 1.005, 0, 0, 0, winCol, winCol);
            put(G, T.windows, dl.x, dl.base + dl.r * 0.4, dl.z, dl.r * 0.83, 0.45, dl.r * 0.83, 0, 1, 0, civTrim, civTrim);
            // A walkway tube from the great dome.
            const s0 = pl.dome.R - 1, s1 = dl.dd - dl.r + 1, len = s1 - s0, sm = (s0 + s1) / 2;
            const ca = Math.cos(dl.a), sa = Math.sin(dl.a), ry = Math.atan2(ca, sa);
            const mx = pl.x + ca * sm, mz = pl.z + sa * sm, ty = Math.min(dl.base, pl.dome.base) + 0.4;
            put(S, T.box, mx, ty, mz, 3.2, 2.8, len, 0, ry, 0, scl(pave, 0.8), civWalls[0]);
            put(G, T.box, mx, ty + 2.2, mz, 3.3, 0.3, len, 0, ry, 0, winCol, winCol);
            tall(dl.x, dl.z, dl.base + dl.r * 0.7 + 1, dl.r);
        }
        /** The arcology: a terraced mountain of a city, a garden on every terrace and a glowing crown. */
        function megaParts(S, G, pl) {
            const m = pl.mega, y0 = groundAround(m.x, m.z, m.rad, false) - 1;
            if (inLane(m.x, m.z, m.rad)) {
                // The ship's way runs through here: a garden plaza instead, so the way stays clear.
                put(S, T.disc, m.x, y0, m.z, m.rad * 0.8, 1.8, m.rad * 0.8, 0, 0, 0, scl(pave, 0.85), pave);
                put(G, T.windows, m.x, y0 + 1.4, m.z, m.rad * 0.81, 0.4, m.rad * 0.81, 0, 0, 0, winCol, winCol);
                for (let k = 0; k < 6; k++) { const a = k * 1.047; put(S, T.ico0, m.x + Math.cos(a) * m.rad * 0.55, y0 + 2.6, m.z + Math.sin(a) * m.rad * 0.55, 1.6, 2.2, 1.6, 0, k, 0, scl(civRoof, 0.7), civRoof); }
                return;
            }
            const wall = civWalls[0], ca = Math.cos(m.rot), sa = Math.sin(m.rot);
            let w = m.rad, yy = y0;
            for (let t = 0; t < m.tiers; t++) {
                const th = m.th, nw = w * 0.8;
                put(S, T.box, m.x, yy, m.z, w * 2, th, w * 2, 0, m.rot, 0, scl(wall, 0.8 + t * 0.025), wall);
                put(G, T.box, m.x, yy + th * 0.6, m.z, w * 2.02, 0.75, w * 2.02, 0, m.rot, 0, winCol, winCol);
                put(G, T.box, m.x, yy + th * 0.26, m.z, w * 2.02, 0.45, w * 2.02, 0, m.rot, 0, scl(winCol, 0.8), scl(winCol, 0.8));
                put(S, T.box, m.x, yy + th, m.z, w * 1.96, 0.5, w * 1.96, 0, m.rot, 0, scl(civRoof, 0.8), civRoof);
                for (let k = 0; k < 4; k++) {
                    const u = (k & 1 ? 1 : -1) * (w + nw) * 0.5, v = (k & 2 ? 1 : -1) * (w + nw) * 0.5;
                    put(S, T.ico0, m.x + u * ca + v * sa, yy + th + 1.1, m.z - u * sa + v * ca, 1.5, 1.9, 1.5, 0, k, 0, scl(civRoof, 0.7), mixc(civRoof, WHITE, 0.1));
                }
                tall(m.x, m.z, yy + th + 1, w * 1.42);
                yy += th; w = nw;
            }
            put(S, T.cone6, m.x, yy, m.z, w * 0.9, m.th * 1.6, w * 0.9, 0, m.rot, 0, wall, mixc(wall, WHITE, 0.4));
            put(S, T.cone6, m.x, yy + m.th * 1.55, m.z, 0.45, 11, 0.45, 0, 0, 0, civSilver, WHITE);
            put(G, T.octa, m.x, yy + m.th * 1.6 + 11.6, m.z, 1.6, 2.2, 1.6, 0, 0, 0, winCol, WHITE);
            put(G, T.windows, m.x, yy + m.th * 0.6, m.z, w * 0.62, 0.6, w * 0.62, 0, 0, 0, winCol, winCol);
            tall(m.x, m.z, yy + m.th * 1.6 + 13, w);
            megasBuilt++;
        }
        /** A light beacon: a slim tower with a glowing orb (its soft beam of light is from the beam pool). */
        function beaconParts(S, G, pl, bc) {
            const y = bc.plat !== undefined ? pl.plats[bc.plat].top : groundOrSea(bc.x, bc.z) - 0.5;
            const wc = civWalls[2];
            put(S, T.cyl8, bc.x, y, bc.z, 2.2, 3, 2.2, 0, 0, 0, scl(wc, 0.8), wc);
            put(S, T.cone6, bc.x, y + 2.8, bc.z, 1.5, bc.h, 1.5, 0, 0, 0, wc, mixc(wc, WHITE, 0.5));
            for (let f = 0.3; f < 0.95; f += 0.22) { const rr = 1.5 * (1 - f) * 1.08 + 0.12; put(G, T.windows, bc.x, y + 2.8 + bc.h * f, bc.z, rr, 0.5, rr, 0, f * 4, 0, winCol, winCol); }
            put(G, T.ico1, bc.x, y + bc.h + 3.6, bc.z, 1.7, 1.7, 1.7, 0, 0, 0, winCol, mixc(winCol, WHITE, 0.6));
            bc.top = y + bc.h + 3.6;
            if (bc.plat === undefined) tall(bc.x, bc.z, bc.top + 2, 3);
            beaconsBuilt++;
        }
        function buildCities(S, G, x0, z0) {
            const list = citiesNear(x0, z0, x0 + CS, z0 + CS, []);
            const inChunk = (x, z) => x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS;
            const baseOf = (b, pl) => b.plat !== undefined ? pl.plats[b.plat].top : groundOrSea(b.x, b.z) - 0.8;
            list.forEach(function (pl) {
                const skipped = new Set();
                pl.plats.forEach(function (pt) { if (inChunk(pt.x, pt.z)) island(S, G, pt); });
                if (pl.dome && inChunk(pl.x, pl.z)) domeParts(S, G, pl);
                pl.domelets.forEach(function (dl) { if (inChunk(dl.x, dl.z)) domelet(S, G, pl, dl); });
                if (pl.mega && inChunk(pl.mega.x, pl.mega.z)) megaParts(S, G, pl);
                pl.b.forEach(function (b, i) {
                    if (b.plat === undefined && !b.inDome) {
                        const rad = (b.kind === 'dome' || b.kind === 'zig' || b.kind === 'house' || b.kind === 'shards' ? b.rad : b.kind === 'tree' ? b.rad * 3.4 : b.rad * 1.3) + (b.h > 24 ? 9 : 0);
                        if (inLane(b.x, b.z, rad)) { skipped.add(i); return; }
                    }
                    if (!inChunk(b.x, b.z)) return;
                    const y = baseOf(b, pl);
                    if (b.plat === undefined) {
                        const gnd = height(b.x, b.z);
                        if (gnd < y - 0.6) put(S, T.cyl8, b.x, gnd - 1.5, b.z, b.rad * 1.35, y - gnd + 2.3, b.rad * 1.35, 0, 0, 0, scl(pave, 0.7), pave);   // a plinth over water or a dip
                    }
                    // High on a hovering island or platform, far over the ship: nothing to climb over.
                    const keepObs = curObs;
                    if (b.plat !== undefined) curObs = null;
                    building(S, G, b, y);
                    curObs = keepObs;
                });
                pl.bridges.forEach(function (br) {
                    let ax, az, bx, bz, y;
                    if (br.pa !== undefined) {
                        const A = pl.plats[br.pa], B = pl.plats[br.pb];
                        ax = A.x; az = A.z; bx = B.x; bz = B.z; y = (A.top + B.top) / 2 - 1.4;
                    } else {
                        if (skipped.has(br.a) || skipped.has(br.b)) return;
                        const A = pl.b[br.a], B = pl.b[br.b];
                        ax = A.x; az = A.z; bx = B.x; bz = B.z;
                        y = Math.max(baseOf(A, pl), baseOf(B, pl)) + Math.min(A.h, B.h) * br.f;
                        for (let k = 0; k <= 4; k++) if (inLane(ax + (bx - ax) * k / 4, az + (bz - az) * k / 4, 2)) return;
                    }
                    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
                    if (!inChunk(mx, mz)) return;
                    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
                    if (CSTYLE === 'crystal') {
                        put(G, T.box, mx, y, mz, 0.9, 0.5, len, 0, ry, 0, mixc(winCol, civRoof, 0.4), mixc(winCol, WHITE, 0.3));          // a beam of light
                    } else if (CSTYLE === 'organic') {
                        put(S, T.box, mx, y, mz, 1.4, 0.8, len, 0, ry, 0, scl(civRoof, 0.65), civRoof);                                     // a living vine walkway
                        put(G, T.box, mx, y - 0.12, mz, 0.4, 0.2, len, 0, ry, 0, winCol, winCol);
                    } else {
                        put(S, T.box, mx, y, mz, floating ? 3 : 1.8, 1.1, len, 0, ry, 0, scl(pave, 0.8), pave);
                        put(G, T.box, mx, y - 0.15, mz, floating ? 3.1 : 1.9, 0.25, len, 0, ry, 0, winCol, winCol);
                    }
                    if (br.pa === undefined) tall(mx, mz, y + 1.5, len / 2);
                });
                pl.masts.forEach(function (m) {
                    if (!inChunk(m.x, m.z) || inLane(m.x, m.z, 2)) return;
                    const y = groundOrSea(m.x, m.z) - 0.5;
                    put(S, T.cone6, m.x, y, m.z, 0.9, m.h, 0.9, 0, 0, 0, lin('#9aa0b0'), lin('#e8ecf4'));
                    put(G, T.windows, m.x, y + m.h * 0.4, m.z, 0.62, 0.6, 0.62, 0, 0, 0, winCol, winCol);
                    put(G, T.windows, m.x, y + m.h * 0.7, m.z, 0.32, 0.5, 0.32, 0, 0, 0, winCol, winCol);
                    put(G, T.ico1, m.x, y + m.h + 0.8, m.z, 1.1, 1.1, 1.1, 0, 0, 0, winCol, mixc(winCol, WHITE, 0.6));
                    tall(m.x, m.z, y + m.h + 2, 2);
                });
                pl.beacons.forEach(function (bc) {
                    if (!inChunk(bc.x, bc.z)) return;
                    if (bc.plat === undefined && inLane(bc.x, bc.z, 3)) { bc.top = null; return; }
                    beaconParts(S, G, pl, bc);
                });
            });
        }
        /** Spaceports: one in every large cell, kept outside the cities. */
        const ports = new Map();
        function portPlan(gx, gz) {
            const key = gx + ',' + gz;
            if (ports.has(key)) return ports.get(key);
            const c = cellAt(PORT, gx, gz);
            let plan = null;
            if (c && civ) {
                plan = { id: 'p' + key, x: c.x, z: c.z, r: c.r, k: c.k, launched: false };
                // Step out to a city's edge if it landed inside one.
                const gx2 = Math.floor(plan.x / CITY.size), gz2 = Math.floor(plan.z / CITY.size);
                for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                    const cc = cellAt(CITY, gx2 + i, gz2 + j);
                    if (!cc) continue;
                    const dx = plan.x - cc.x, dz = plan.z - cc.z, dd = Math.hypot(dx, dz) || 1, need = cc.r + plan.r + 10;
                    if (dd < need) { plan.x = cc.x + dx / dd * need; plan.z = cc.z + dz / dd * need; }
                }
                let lo = Infinity, hi = -Infinity;
                for (let k = 0; k < 9; k++) {
                    const a = k / 8 * 6.283, rr = k === 8 ? 0 : plan.r;
                    const g = groundOrSea(plan.x + Math.cos(a) * rr, plan.z + Math.sin(a) * rr);
                    lo = Math.min(lo, g); hi = Math.max(hi, g);
                }
                plan.top = gas ? height(plan.x, plan.z) + 34 : hi + 0.4;
                plan.low = gas ? plan.top - 2.4 : lo - 1.2;
            }
            ports.set(key, plan);
            if (ports.size > 64) ports.delete(ports.keys().next().value);
            return plan;
        }
        const silver = lin('#d0d6e0');
        function buildPort(S, G, x0, z0) {
            const g0x = Math.floor(x0 / PORT.size), g0z = Math.floor(z0 / PORT.size);
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const pp = portPlan(g0x + i, g0z + j);
                if (!pp || pp.x < x0 || pp.x >= x0 + CS || pp.z < z0 || pp.z >= z0 + CS) continue;
                const r = U.rng(U.hash(seed, 'portbuild', pp.id)), R = pp.r, y = pp.top;
                put(S, T.disc, pp.x, pp.low, pp.z, R, y - pp.low, R, 0, 0, 0, lin('#8a90a0'), lin('#c8ccd8'));
                put(S, T.disc, pp.x, y - 0.05, pp.z, R * 0.32, 0.12, R * 0.32, 0, 0, 0, mixc(civRoof, WHITE, 0.3), mixc(civRoof, WHITE, 0.3));
                put(G, T.windows, pp.x, y - 0.6, pp.z, R * 1.01, 0.5, R * 1.01, 0, 0, 0, winCol, winCol);
                for (let k = 0; k < 12; k++) {
                    const a = k / 12 * 6.283;
                    put(G, T.octa, pp.x + Math.cos(a) * R * 0.86, y + 0.15, pp.z + Math.sin(a) * R * 0.86, 0.35, 0.25, 0.35, 0, 0, 0, winCol, WHITE);
                }
                const parked = 2 + Math.floor(pp.k * 2.99);
                for (let k = 0; k < parked; k++) {
                    const a = k / parked * 6.283 + 0.5, px = pp.x + Math.cos(a) * R * 0.56, pz = pp.z + Math.sin(a) * R * 0.56;
                    const hue = lin(U.toHex(U.hsl(r.range(0, 360), 0.45, 0.72)));
                    put(S, T.ico1, px, y + 0.85, pz, 2.6, 0.62, 2.6, 0, 0, 0, scl(silver, 0.8), mixc(silver, hue, 0.4));
                    put(S, T.cap, px, y + 1.2, pz, 1.05, 0.85, 1.05, 0, 0, 0, lin('#7ac8f0'), lin('#c8f0ff'));
                    put(G, T.windows, px, y + 0.7, pz, 2.5, 0.25, 2.5, 0, 0, 0, winCol, winCol);
                }
                tall(pp.x, pp.z, y + 3, R);
                // Control tower with a beacon on top.
                const a = r() * 6.283, tx = pp.x + Math.cos(a) * (R + 6), tz = pp.z + Math.sin(a) * (R + 6);
                if (!inLane(tx, tz, 3)) {
                    const ty = gas ? y : groundOrSea(tx, tz) - 0.6, th = gas ? 10 : y - ty + 12;
                    put(S, T.cyl8, tx, ty, tz, 2, th, 2, 0, 0, 0, scl(civWalls[1], 0.85), civWalls[1]);
                    put(S, T.hemi, tx, ty + th, tz, 3, 2, 3, 0, 0, 0, mixc(civRoof, WHITE, 0.2), mixc(civRoof, WHITE, 0.5));
                    put(G, T.windows, tx, ty + th + 0.4, tz, 3.02, 0.8, 3.02, 0, 0, 0, winCol, winCol);
                    put(S, T.cone6, tx, ty + th + 1.6, tz, 0.3, 7, 0.3, 0, 0, 0, silver, WHITE);
                    put(G, T.ico1, tx, ty + th + 9, tz, 0.7, 0.7, 0.7, 0, 0, 0, winCol, WHITE);
                    tall(tx, tz, ty + th + 10, 3.5);
                }
            }
        }

        // ----- a civilisation's technology on the ground: maglev rails, solar farms, farms -------------
        const PANEL0 = lin('#14244a'), PANEL1 = lin('#5a8ad8'), GLINT = lin('#cfeeff'), RAIL = lin('#e2e6ee'), PYLON = lin('#9aa2b2');
        const BARN = lin('#b8604c'), BARN_ROOF = lin('#5f6a80'), SILO = lin('#dde1e8');
        const CROPS = ['#7aa83a', '#c8b048', '#8a6a3a', '#5a9a48', '#d8c070', '#9a86c0', '#6aa86a'].map(h => mixc(lin(h), pal.mid, 0.22));
        const HEDGE = scl(mixc(lin('#3a6a2a'), pal.mid, 0.3), 0.8);
        let panelsBuilt = 0, railBuilt = 0, barnsBuilt = 0;
        /** Yaw, then tip (Euler order YXZ): tilted solar panels, sloping rails. */
        function putR(B, tpl, x, y, z, sx, sy, sz, rx, ry, rz, c0, c1) {
            q.setFromEuler(eul.set(rx || 0, ry || 0, rz || 0, 'YXZ'));
            eul.order = 'XYZ';
            mtx.compose(vp.set(x, y, z), q, vs.set(sx, sy, sz));
            B.add(tpl, mtx.elements, c0, c1 || c0);
        }
        /** Patchwork farm fields round a city (the terrain's own colour, so they cost nothing to draw). */
        function farmTint(x, z, jit, out) {
            const nc = nearCity(x, z);
            if (nc.q < 1.08 || nc.q > 1.75) return;
            const ca = Math.cos(nc.a), sa = Math.sin(nc.a);
            const u = (x - nc.x) * ca + (z - nc.z) * sa, v = (z - nc.z) * ca - (x - nc.x) * sa;
            const fu = u / 22, fv = v / 30, cu = Math.floor(fu), cv = Math.floor(fv);
            const h = U.hash(seed, 'field', cu, cv, nc.x | 0) & 7;
            const edge = Math.min(fu - cu, 1 - (fu - cu)) < 0.07 || Math.min(fv - cv, 1 - (fv - cv)) < 0.05;
            const col = edge ? HEDGE : h < CROPS.length ? CROPS[h] : null;
            if (!col) return;
            const k = 0.62 * (1 - U.smooth((nc.q - 1.55) / 0.2));
            out[0] += (col[0] * jit - out[0]) * k; out[1] += (col[1] * jit - out[1]) * k; out[2] += (col[2] * jit - out[2]) * k;
        }
        /** Maglev links: a city to its neighbour east (dir 0) or south (dir 1), most of them. */
        const links = new Map();
        function linkOf(gx, gz, dir) {
            const key = gx + ',' + gz + ',' + dir;
            if (links.has(key)) return links.get(key);
            let L = null;
            const A = cellAt(CITY, gx, gz);
            if (A && (U.hash(seed, 'rail', gx, gz, dir) & 255) < 190) {
                const ax = A.x, az = A.z, ar = A.r;
                const B = cellAt(CITY, gx + (dir ? 0 : 1), gz + (dir ? 1 : 0));
                if (B) {
                    const dx = B.x - ax, dz = B.z - az, Dd = Math.hypot(dx, dz), ux = dx / Dd, uz = dz / Dd;
                    const s0 = ar * 1.02, s1 = Dd - B.r * 1.02;
                    if (s1 - s0 > 30) L = { id: key, sx: ax + ux * s0, sz: az + uz * s0, ux: ux, uz: uz, len: s1 - s0, yaw: Math.atan2(ux, uz) };
                }
            }
            links.set(key, L);
            if (links.size > 240) links.delete(links.keys().next().value);
            return L;
        }
        /** The rail's height along a link: well over the ground (or the sea), smoothed. */
        function railY(L, s) {
            let m = -Infinity;
            for (let k = -1; k <= 1; k++) { const t = U.clamp(s + k * 14, 0, L.len); m = Math.max(m, groundOrSea(L.sx + L.ux * t, L.sz + L.uz * t)); }
            return m + 6.5;
        }
        function railChunk(S, G, L, x0, z0) {
            let t0 = 0, t1 = L.len;
            const clip = (p, u, lo, hi) => {
                if (Math.abs(u) < 1e-6) return p >= lo && p < hi;
                let a = (lo - p) / u, b = (hi - p) / u;
                if (a > b) { const tt = a; a = b; b = tt; }
                t0 = Math.max(t0, a); t1 = Math.min(t1, b);
                return t0 < t1;
            };
            if (!clip(L.sx, L.ux, x0, x0 + CS) || !clip(L.sz, L.uz, z0, z0 + CS)) return;
            const STEP = 8;
            for (let s = Math.floor(t0 / STEP) * STEP; s < t1; s += STEP) {
                if (s < 0 || s >= L.len) continue;
                const se = Math.min(L.len, s + STEP), sm = (s + se) / 2;
                const mx = L.sx + L.ux * sm, mz = L.sz + L.uz * sm;
                if (mx < x0 || mx >= x0 + CS || mz < z0 || mz >= z0 + CS) continue;     // each piece belongs to the chunk holding its middle
                const ya = railY(L, s), yb = railY(L, se), y = (ya + yb) / 2, p = Math.atan2(yb - ya, se - s), len = (se - s) * 1.04 / Math.cos(p);
                putR(S, T.box, mx, y - 0.9, mz, 1.9, 0.9, len, -p, L.yaw, 0, scl(RAIL, 0.82), RAIL);
                putR(G, T.box, mx, y + 0.02, mz, 0.5, 0.1, len, -p, L.yaw, 0, winCol, winCol);
                if (Math.round(s) % 24 === 0) {
                    const px = L.sx + L.ux * s, pz = L.sz + L.uz * s, g = height(px, pz);
                    put(S, T.cyl5, px, g - 1, pz, 0.6, ya - 0.9 - g + 1, 0.6, 0, 0, 0, PYLON, scl(RAIL, 0.9));
                    put(S, T.box, px, ya - 1.3, pz, 3.2, 0.5, 1.2, 0, L.yaw, 0, PYLON, RAIL);
                }
                tall(mx, mz, y + 1.6, 4.5);      // the ship rises over the rails
                railBuilt++;
            }
            // A little station where the line meets each city.
            [0, L.len].forEach(function (s) {
                const x = L.sx + L.ux * s, z = L.sz + L.uz * s;
                if (x < x0 || x >= x0 + CS || z < z0 || z >= z0 + CS || inLane(x, z, 7)) return;
                const y = railY(L, s), g = groundOrSea(x, z);
                put(S, T.box, x, g - 0.6, z, 5, y - 1.4 - g + 0.6, 12, 0, L.yaw, 0, scl(civWalls[1], 0.85), civWalls[1]);
                put(S, T.cap, x, y + 2.6, z, 3.4, 1.6, 6.5, 0, L.yaw, 0, mixc(civRoof, WHITE, 0.2), mixc(civRoof, WHITE, 0.5));
                put(G, T.box, x, y - 1.5, z, 5.1, 0.4, 12.1, 0, L.yaw, 0, winCol, winCol);
                tall(x, z, y + 4.5, 7);
            });
        }
        function buildTech(S, G, x0, z0) {
            const inC = (x, z) => x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS;
            if (SOLAR_N) {
                citiesNear(x0, z0, x0 + CS, z0 + CS, []).forEach(function (pl) {
                    solarFields(pl.gx, pl.gz, pl.x, pl.z, pl.r, fieldTmp);
                    fieldTmp.slice().forEach(function (f) {
                        if (Math.abs(f.x - x0 - CS / 2) > CS / 2 + 24 || Math.abs(f.z - z0 - CS / 2) > CS / 2 + 24) return;
                        const ca = Math.cos(f.a), sa = Math.sin(f.a);
                        let row = 0;
                        for (let u = -8.4; u <= 8.41; u += 4.2, row++) for (let v = -14.4; v <= 14.41; v += 3.6) {
                            const px = f.x + u * ca - v * sa, pz = f.z + u * sa + v * ca;
                            if (!inC(px, pz)) continue;
                            const h = height(px, pz);
                            if (hasSea && h < seaH + 0.3) continue;
                            putR(S, T.box, px, h + 0.7, pz, 2.1, 0.12, 3.3, 0, -f.a, 0.42, PANEL0, PANEL1);
                            if (row % 2 === 0 && detail !== 'low') putR(G, T.box, px, h + 0.83, pz, 0.22, 0.04, 3.2, 0, -f.a, 0.42, GLINT, GLINT);
                            panelsBuilt++;
                        }
                    });
                });
            }
            if (TECH.farms) {
                const fr = U.rng(U.hash(seed, 'farm', x0, z0));
                for (let k = 0; k < 2; k++) {
                    const x = x0 + fr() * CS, z = z0 + fr() * CS, keep = fr();
                    const nc = nearCity(x, z), qn = nc.q, ang = nc.a;
                    if (qn < 1.15 || qn > 1.65 || keep < 0.35) continue;
                    const h = height(x, z);
                    if ((hasSea && h < seaH + 0.6) || slopeAt(x, z) > 0.2 || inLane(x, z, 9) || cityQ(x, z) < 1) continue;
                    put(S, T.box, x, h - 0.3, z, 6, 4.4, 9, 0, ang, 0, scl(BARN, 0.85), BARN);
                    put(S, T.cone6, x, h + 4.05, z, 4.6, 2.6, 6.6, 0, ang + 0.5236, 0, BARN_ROOF, mixc(BARN_ROOF, WHITE, 0.25));
                    const sx = x + Math.cos(ang) * 5.6, sz = z - Math.sin(ang) * 5.6;
                    put(S, T.cyl8, sx, h - 0.3, sz, 1.6, 8.4, 1.6, 0, 0, 0, scl(SILO, 0.85), SILO);
                    put(S, T.hemi, sx, h + 8.05, sz, 1.65, 1.3, 1.65, 0, 0, 0, SILO, WHITE);
                    tall(x, z, h + 9.5, 7);
                    barnsBuilt++;
                }
            }
            if (TECH.maglev) {
                const m = CITY.size;
                const gx0 = Math.floor((x0 - m) / m), gx1 = Math.floor((x0 + CS + m) / m);
                const gz0 = Math.floor((z0 - m) / m), gz1 = Math.floor((z0 + CS + m) / m);
                for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) for (let dir = 0; dir < 2; dir++) {
                    const L = linkOf(gx, gz, dir);
                    if (L) railChunk(S, G, L, x0, z0);
                }
            }
        }

        function buildChunk(cx, cz) {
            const N = D.cells, st = CS / N, x0 = cx * CS, z0 = cz * CS;
            const S = new Builder(), G = new Builder();
            let normals = null;
            if (gas) {
                // Smooth rolling cloud deck: per-vertex colours and normals (one ring of extra samples).
                const W = N + 3, Hh = new Float32Array(W * W);
                for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) Hh[j * W + i] = height(x0 + (i - 1) * st, z0 + (j - 1) * st);
                const nv = [], cc = [0, 0, 0];
                const vert = (i, j) => {
                    const h = Hh[(j + 1) * W + i + 1];
                    const gx = (Hh[(j + 1) * W + i + 2] - Hh[(j + 1) * W + i]) / (2 * st), gz = (Hh[(j + 2) * W + i + 1] - Hh[j * W + i + 1]) / (2 * st);
                    const L = Math.sqrt(gx * gx + 1 + gz * gz);
                    const x = x0 + i * st, z = z0 + j * st;
                    bandColour(x, z, cc);
                    const lift = 0.74 + 0.36 * U.smooth((h + 10) / 22);
                    S.v(x, h, z, [cc[0] * lift, cc[1] * lift, cc[2] * lift]);
                    nv.push(-gx / L, 1 / L, -gz / L);
                };
                for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                    vert(i, j); vert(i, j + 1); vert(i + 1, j);
                    vert(i + 1, j); vert(i, j + 1); vert(i + 1, j + 1);
                }
                normals = nv;
            } else {
                const W = N + 1, Hh = new Float32Array(W * W);
                for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) Hh[j * W + i] = height(x0 + i * st, z0 + j * st);
                const fc = [0, 0, 0];
                const tri = (ax, ay, az, bx, by, bz, qx, qy, qz, i, j, t) => {
                    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = qx - ax, e2y = qy - ay, e2z = qz - az;
                    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
                    const slope = 1 - ny / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
                    const hm = (ay + by + qy) / 3;
                    const jit = 1 - jitAmp / 2 + (U.hash(seed, cx * 64 + i, cz * 64 + j, t) & 255) / 255 * jitAmp;
                    faceColour(hm, slope, jit, fc);
                    if (civ) {
                        const mx = (ax + bx + qx) / 3, mz = (az + bz + qz) / 3, cq = cityQ(mx, mz);
                        if (cq < 1.0) { const k = U.smooth((1.0 - cq) / 0.35) * 0.3; fc[0] += (pave[0] * jit - fc[0]) * k; fc[1] += (pave[1] * jit - fc[1]) * k; fc[2] += (pave[2] * jit - fc[2]) * k; }
                        else if (TECH.farms && hm > seaH + 0.4 && slope < 0.3) farmTint(mx, mz, jit, fc);      // patchwork fields round the cities
                    }
                    const B = lavaShore && hm < seaH + 0.8 && hm > seaH - 1.5 ? G : S;
                    const c = B === G ? mixc(lavaShore, fc, U.clamp((hm - seaH) / 0.8, 0, 1) * 0.6) : fc;
                    B.v(ax, ay, az, c); B.v(bx, by, bz, c); B.v(qx, qy, qz, c);
                };
                for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                    const a = Hh[j * W + i], b = Hh[j * W + i + 1], c = Hh[(j + 1) * W + i], dd = Hh[(j + 1) * W + i + 1];
                    const xa = x0 + i * st, za = z0 + j * st, xb = xa + st, zc = za + st;
                    if ((i + j) & 1) {
                        tri(xa, a, za, xa, c, zc, xb, b, za, i, j, 0);
                        tri(xb, b, za, xa, c, zc, xb, dd, zc, i, j, 1);
                    } else {
                        tri(xa, a, za, xa, c, zc, xb, dd, zc, i, j, 0);
                        tri(xa, a, za, xb, dd, zc, xb, b, za, i, j, 1);
                    }
                }
            }
            const ch = { cx: cx, cz: cz, solid: null, glow: null, tris: 0, obs: [], plants: [] };
            curObs = ch.obs;
            curPlants = ch.plants;
            const r = U.rng(U.hash(seed, 'chunk', cx, cz));
            cityMask = !!civ;
            features(S, G, r, x0, z0);
            curPlants = null;
            cityMask = false;
            if (civ) {
                const keep = curObs;
                if (gas) curObs = null;            // floating cities ride far above the ship: nothing to climb over
                buildCities(S, G, x0, z0); buildPort(S, G, x0, z0); buildTech(S, G, x0, z0);
                curObs = keep;
            }
            curObs = null;
            const gS = made(S.build(THREE, normals)), gG = made(G.build(THREE));
            if (gS) { ch.solid = new THREE.Mesh(gS, gas ? matDeck : matTerrain); ch.tris += gS.attributes.position.count / 3; }
            if (gG) { ch.glow = new THREE.Mesh(gG, matGlow); ch.tris += gG.attributes.position.count / 3; }
            [ch.solid, ch.glow].forEach(m => { if (m) { m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); } });
            return ch;
        }
        function dropChunk(ch) {
            [ch.solid, ch.glow].forEach(m => { if (m) { scene.remove(m); free(m.geometry); } });
        }
        /** Wanted: inside the view radius, and not far behind the ship's heading. */
        function keepChunk(cx, cz, R, behind) {
            const dx = (cx + 0.5) * CS - shipPos.x, dz = (cz + 0.5) * CS - shipPos.z;
            if (dx * dx + dz * dz > R * R) return false;
            return dx * fwd.x + dz * fwd.z > -behind;
        }
        function stream(budgetMs) {
            const R = D.far * fogK[1] + CS * 0.55;      // every point that is not fully fogged is covered
            for (const [key, ch] of chunks) if (!keepChunk(ch.cx, ch.cz, R + CS * 0.5, CS * 1.15)) { dropChunk(ch); chunks.delete(key); }
            if (relane) {
                // After a turn, far chunks (deep in the haze) with tall things in the new course are
                // rebuilt, so the way ahead stays clear; near ones stay as they are (no popping).
                relane = false;
                const far2 = Math.pow(Math.max(280, D.far * 0.68), 2);
                for (const [key, ch] of chunks) {
                    const dx = (ch.cx + 0.5) * CS - shipPos.x, dz = (ch.cz + 0.5) * CS - shipPos.z;
                    if (dx * dx + dz * dz < far2) continue;
                    const o = ch.obs;
                    for (let k = 0; k < o.length; k += 4) {
                        if (inLane(o[k], o[k + 1], o[k + 2])) { dropChunk(ch); chunks.delete(key); break; }
                    }
                }
            }
            const need = [];
            const x0 = Math.floor((shipPos.x - R) / CS), x1 = Math.floor((shipPos.x + R) / CS);
            const z0 = Math.floor((shipPos.z - R) / CS), z1 = Math.floor((shipPos.z + R) / CS);
            for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
                if (chunks.has(cx + ',' + cz) || !keepChunk(cx, cz, R, CS * 0.8)) continue;
                const dx = (cx + 0.5) * CS - shipPos.x, dz = (cz + 0.5) * CS - shipPos.z;
                // Nearest first, and what lies ahead before what lies to the side.
                need.push([dx * dx + dz * dz - (dx * fwd.x + dz * fwd.z) * 60, cx, cz]);
            }
            need.sort((a, b) => a[0] - b[0]);
            const t0 = now();
            for (let i = 0; i < need.length; i++) {
                if (i > 0 && now() - t0 > budgetMs) break;
                chunks.set(need[i][1] + ',' + need[i][2], buildChunk(need[i][1], need[i][2]));
            }
        }
        /** The highest tall thing (tree, spire, tower, cloud bank) near a point, or -Infinity. */
        function obstacleTop(x, z) {
            let top = -Infinity;
            const gx = Math.floor(x / CS), gz = Math.floor(z / CS);
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const ch = chunks.get((gx + i) + ',' + (gz + j));
                if (!ch) continue;
                const o = ch.obs;
                for (let k = 0; k < o.length; k += 4) {
                    const dx = x - o[k], dz = z - o[k + 1], rr = o[k + 2] + 3;
                    if (dx * dx + dz * dz < rr * rr && o[k + 3] > top) top = o[k + 3];
                }
            }
            for (let s = 0; s < solidPuffs.length; s++) {
                const L = solidPuffs[s].list;
                for (let k = 0; k < L.length; k++) {
                    const p = L[k];
                    if (p.hidden) continue;
                    const dx = x - p.x, dz = z - p.z, rr = p.r * 2.2 + 3;
                    if (dx * dx + dz * dz < rr * rr) top = Math.max(top, p.y + p.r * p.fy * 1.3 * U.smooth(p.fadeK));
                }
            }
            return top;
        }

        // ----- drifting puffs: gas cloud layers, sky clouds, lava smoke, toxic bubbles -----------
        const puffSets = [], solidPuffs = [];
        function Puffs(name, count, geoTpl, mat, spawn, solid) {
            const r = U.rng(U.hash(seed, 'puffs', name));
            const geo = made(geoTpl);
            const mesh = new THREE.InstancedMesh(geo, mat, count);
            mesh.frustumCulled = false;
            if (mesh.instanceMatrix.setUsage) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            const list = [], c = new THREE.Color();
            for (let i = 0; i < count; i++) {
                const p = { x: 0, y: 0, z: 0, r: 1, fy: 1, vx: 0, vy: 0, grow: 0, age: 0, life: Infinity, pop: false, col: WHITE, hidden: false, rot: r() * 6, fadeK: 1, fadeOut: false };
                spawn(p, r, true);
                list.push(p);
                mesh.setColorAt(i, c.setRGB(p.col[0], p.col[1], p.col[2]));
            }
            scene.add(mesh);
            const set = {
                name: name, mesh: mesh, mat: mat, geo: geo, list: list,
                update: function (dt) {
                    let recol = false;
                    const lim = D.far + 80;
                    for (let i = 0; i < count; i++) {
                        const p = list[i];
                        p.age += dt;
                        p.x += p.vx * dt; p.y += p.vy * dt;
                        const along = alongOf(p.x, p.z), dx = p.x - shipPos.x, dz = p.z - shipPos.z;
                        // Big cloud banks that end up in the way after a turn shrink away gently.
                        if (solid && !p.fadeOut && along > 60 && inLane(p.x, p.z, p.r * 2.2)) p.fadeOut = true;
                        if (p.fadeOut) p.fadeK -= dt / 2.5;
                        if (p.age > p.life || along < -60 || dx * dx + dz * dz > lim * lim || (p.hidden && p.age > 0.5) || p.fadeK <= 0) {
                            p.fadeK = 1; p.fadeOut = false;
                            spawn(p, r, false);
                            mesh.setColorAt(i, c.setRGB(p.col[0], p.col[1], p.col[2]));
                            recol = true;
                        }
                        let s = p.r;
                        if (p.life !== Infinity) {
                            const a = p.age / p.life;
                            s *= p.pop ? U.smooth(a / 0.2) * (a > 0.92 ? 1 - (a - 0.92) / 0.08 : 1) * (1 + a * 0.4)
                                : U.smooth(a / 0.15) * (1 - U.smooth((a - 0.7) / 0.3)) * (0.6 + a * p.grow);
                        }
                        s *= U.smooth(p.fadeK);
                        if (p.hidden || !(s > 0)) { mtx.makeScale(0, 0, 0); mesh.setMatrixAt(i, mtx); continue; }
                        q.setFromEuler(eul.set(0, p.rot, 0));
                        mtx.compose(vp.set(p.x, p.y, p.z), q, vs.set(s, s * p.fy, s));
                        mesh.setMatrixAt(i, mtx);
                    }
                    mesh.instanceMatrix.needsUpdate = true;
                    if (recol && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                },
                dispose: function () { scene.remove(mesh); free(geo); if (mesh.dispose) mesh.dispose(); }
            };
            puffSets.push(set);
            if (solid) solidPuffs.push(set);
            set.update(0);
            return set;
        }
        /** A lumpy cloud: a few soft blobs merged (smooth per-blob normals), about 4 x 1.3 x 2.4 units. */
        function cloudGeometry(blobs, salt) {
            const r = U.rng(U.hash(seed, 'cloudgeo', salt));
            const ico = new THREE.IcosahedronGeometry(1, 1);
            const src = ico.index ? ico.toNonIndexed() : ico;
            if (src !== ico) ico.dispose();
            const a = src.attributes.position.array, Pp = [], N = [];
            for (let b = 0; b < blobs; b++) {
                const cx = b ? r.range(-1.2, 1.2) : 0, cy = b ? r.range(-0.1, 0.3) : 0.1, cz = b ? r.range(-0.55, 0.55) : 0;
                const rad = b ? r.range(0.55, 0.85) : 1;
                for (let i = 0; i < a.length; i += 3) {
                    Pp.push(cx + a[i] * rad, cy + a[i + 1] * rad, cz + a[i + 2] * rad);
                    N.push(a[i], a[i + 1], a[i + 2]);
                }
            }
            src.dispose();
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
            g.computeBoundingSphere();
            return g;
        }
        const fill = scl(airless ? [0.3, 0.3, 0.3] : skyHor, is('storms') ? 0.18 : 0.32);
        const matPuffSoft = keepMat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(fill[0], fill[1], fill[2]) }));
        const matPuffFlat = keepMat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
        const matPuffGlow = keepMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const ahead = (r, initial, lo, hi) => initial ? r.range(-40, hi) : r.range(lo, hi);
        function makePuffs() {
            puffSets.splice(0).forEach(s => s.dispose());
            solidPuffs.length = 0;
            const k = D.puffs, far = D.far;
            if (gas) {
                const storm = is('storms'), calm = is('calm');
                // Billows on the deck (kept beside the ship's way ahead), high wisps, and towering cloud banks.
                Puffs('billow', Math.round((calm ? 28 : storm ? 85 : 70) * k), cloudGeometry(3, 'billow'), matPuffSoft, function (p, r, init) {
                    p.r = r.range(4, storm ? 10 : 9);
                    lanePoint(ahead(r, init, far * 0.6, far * 0.95), r.sign() * r.range(p.r * 2.4 + 9, 150), tmpP);
                    p.x = tmpP.x; p.z = tmpP.z; p.y = height(p.x, p.z) - p.r * 0.45; p.fy = r.range(0.6, 0.85);
                    p.vx = r.range(1, 2.5) * (storm ? 1.6 : 1); p.vy = 0; p.age = 0; p.life = Infinity;
                    const cc = bandColour(p.x, p.z, [0, 0, 0]); p.col = storm ? scl(cc, 0.85) : mixc(cc, WHITE, r.range(0.08, 0.22));
                });
                Puffs('wisp', Math.round((calm ? 34 : 26) * k), cloudGeometry(4, 'wisp'), matPuffSoft, function (p, r, init) {
                    lanePoint(ahead(r, init, far * 0.6, far * 0.95), r.range(-220, 220), tmpP);
                    p.x = tmpP.x; p.z = tmpP.z; p.r = r.range(7, 14); p.fy = r.range(0.35, 0.5);
                    p.y = height(p.x, p.z) + r.range(42, 70); p.vx = r.range(2, 4); p.vy = 0; p.age = 0; p.life = Infinity;
                    p.col = storm ? scl(bandColour(p.x, p.z, [0, 0, 0]), 0.7) : mixc(bandColour(p.x, p.z, [0, 0, 0]), WHITE, 0.45);
                });
                Puffs('bank', Math.round((storm ? 24 : calm ? 6 : 12) * k) + 2, cloudGeometry(5, 'bank'), matPuffSoft, function (p, r, init) {
                    lanePoint(ahead(r, init, far * 0.7, far * 0.98), r.sign() * r.range(storm ? 80 : 110, 260), tmpP);
                    p.x = tmpP.x; p.z = tmpP.z; p.r = storm ? r.range(14, 24) : r.range(12, 22); p.fy = storm ? r.range(1.2, 1.7) : r.range(0.9, 1.3);
                    p.y = height(p.x, p.z) - p.r * 0.2; p.vx = r.range(0.5, 1.5); p.vy = 0; p.age = 0; p.life = Infinity;
                    p.col = storm ? scl(bandColour(p.x, p.z, [0, 0, 0]), 0.55) : mixc(bandColour(p.x, p.z, [0, 0, 0]), WHITE, 0.3);
                }, true);
            } else if (world.clouds && !airless) {
                const cc = lin(world.clouds.color || '#ffffff');
                Puffs('cloud', Math.round(24 * k) + 4, cloudGeometry(5, 'cloud'), matPuffSoft, function (p, r, init) {
                    lanePoint(ahead(r, init, far * 0.6, far * 0.98), r.range(-260, 260), tmpP);
                    p.x = tmpP.x; p.z = tmpP.z; p.r = r.range(6, 13); p.fy = r.range(0.5, 0.7);
                    p.y = shipPos.y + r.range(55, 95); p.vx = r.range(1, 2.5); p.vy = 0; p.age = 0; p.life = Infinity;
                    p.col = mixc(cc, skyHor, r.range(0, 0.25));
                });
            }
            if (type === 'lava' && (hasSea || is('volcanoes'))) {
                Puffs('smoke', Math.round((is('volcanoes') ? 30 : 22) * k) + 4, cloudGeometry(3, 'smoke'), matPuffFlat, function (p, r, init) {
                    p.hidden = true; p.age = init ? -r.range(0, 4) : 0;
                    let y = seaH + 0.5;
                    for (let t = 0; t < 10; t++) {
                        lanePoint(init ? r.range(10, far * 0.8) : r.range(far * 0.3, far * 0.85), r.sign() * r.range(12, 110), tmpP);
                        if (is('volcanoes') && t < 6) {              // from a crater top
                            const C = CELL.volcano, c = cellAt(C, Math.floor(tmpP.x / C.size), Math.floor(tmpP.z / C.size));
                            if (c) { tmpP.x = c.x + r.range(-2, 2); tmpP.z = c.z + r.range(-2, 2); y = height(tmpP.x, tmpP.z) + 0.5; p.hidden = false; break; }
                            continue;
                        }
                        if (hasSea && height(tmpP.x, tmpP.z) < seaH - 0.3) { y = seaH + 0.5; p.hidden = false; break; }
                    }
                    p.x = tmpP.x; p.z = tmpP.z; p.y = y; p.r = r.range(1.4, 2.8) * (is('volcanoes') ? 1.4 : 1); p.fy = 1.15; p.grow = 2.2;
                    p.vx = r.range(0.4, 1.2); p.vy = r.range(1.1, 2.2); p.life = r.range(7, 11);
                    if (init && !p.hidden) p.age = r.range(0, p.life * 0.8);
                    const g = r.range(0.16, 0.3); p.col = mixc([g, g * 0.9, g * 0.86], skyHor, 0.25);
                });
            }
            if (type === 'toxic' && hasSea) {
                const bc = mixc(pal.sea, lin('#f0ffb0'), 0.4);
                const many = is('bubbles') ? 2 : is('swamp') ? 1.4 : 1;
                Puffs('bubble', Math.round(28 * k * many) + 4, new THREE.IcosahedronGeometry(1, 0), matPuffGlow, function (p, r, init) {
                    p.hidden = true;
                    for (let t = 0; t < 10; t++) {
                        lanePoint(init ? r.range(5, far * 0.6) : r.range(far * 0.2, far * 0.6), r.sign() * r.range(4, 80), tmpP);
                        if (height(tmpP.x, tmpP.z) < seaH - 0.2) { p.hidden = false; break; }
                    }
                    p.x = tmpP.x; p.z = tmpP.z; p.y = seaH; p.r = r.range(0.35, 1.0); p.fy = 0.8; p.pop = true;
                    p.vx = 0; p.vy = r.range(0.2, 0.5); p.age = init ? r.range(0, 2) : 0; p.life = r.range(2, 3.5);
                    p.col = bc;
                });
            }
        }

        // ----- creatures: herds, flocks, schools and the rare ones -------------------------------------
        // Each species lives its own way (the user: not "1 or 2 lame looking animals bouncing around"):
        // grazers in herds, birds in wheeling flocks, fish in schools that leap from the waves, dolphins
        // in pods, crabs and beetles in little colonies, jellies drifting in loose bunches. A few of each
        // species are full animated models (the leaders); the rest of a herd, flock or school are copies
        // of the same animal (one instanced mesh per species) that keep formation round their leader.
        // A golden creature and a gentle giant (world.goldSeed / world.giantSeed) come into view early.
        const speciesList = [];
        const creatures = [];          // leaders: full animated models
        const herds = [];              // per species: { spec, si, mesh, glow, members }
        const crng = U.rng(U.hash(seed, 'creatures'));
        const walkable = h => !hasSea || type === 'ice' || h >= seaH + 0.15;
        const swimmable = h => hasSea && type !== 'ice' && h < seaH - 0.8;
        if (world.life && world.life.species && NSE.Creatures) {
            world.life.species.forEach(function (s) {
                try { const sp = NSE.Creatures.spec(s, world); if (sp) speciesList.push(sp); } catch (e) { /* skip a species that fails */ }
            });
        }
        /** How each kind lives: [way, fewest, most] companions per leader. */
        const SOCIAL = {
            grazer: ['herd', 5, 8], stocky: ['herd', 4, 6], lithe: ['herd', 4, 7], tortoise: ['herd', 1, 3], pup: ['pack', 3, 5], dino: ['pack', 2, 4],
            upright: ['pack', 2, 4], hopper: ['pack', 3, 5], bird: ['flock', 6, 11], moth: ['swarm', 5, 9], bat: ['swarm', 5, 8],
            fish: ['school', 8, 14], dolphin: ['pod', 3, 5], whale: ['pod', 1, 2], turtle: ['pod', 1, 3], seanoodle: ['solo', 0, 0],
            bell: ['drift', 3, 5], siphon: ['drift', 2, 4], balloon: ['drift', 3, 5], ray: ['drift', 2, 3], crab: ['colony', 2, 4], beetle: ['colony', 2, 4],
            pillbug: ['colony', 2, 4], snail: ['colony', 1, 3], slug: ['colony', 1, 2], frog: ['colony', 2, 4], caterpillar: ['colony', 1, 3], octo: ['colony', 1, 2],
            crawler: ['colony', 1, 3], fluff: ['colony', 2, 4], smooth: ['colony', 1, 3], pear: ['colony', 1, 3], noodle: ['solo', 0, 0]
        };
        const FOLLOWERS = { high: 44, standard: 28, low: 12 };
        const seenRare = { rainbow: false, golden: false, giant: false };
        function socialOf(spec) {
            if (spec.golden) return ['solo', 0, 0];
            if (spec.giant) return spec.variant === 'whale' ? ['pod', 1, 1] : ['solo', 0, 0];
            return SOCIAL[spec.variant] || ['colony', 1, 2];
        }
        function placeCreature(c, initial) {
            const r = crng;
            let ok = false;
            const rare = c.spec.giant ? 'giant' : c.spec.golden ? 'golden' : null;
            for (let tries = 0; tries < 16 && !ok; tries++) {
                let ah, lat;
                if (rare === 'giant') { ah = initial ? r.range(110, 200) : r.range(D.far * 0.55, D.far * 0.8); lat = r.sign() * r.range(32, 62); }
                else if (rare === 'golden') { ah = initial ? r.range(60, 140) : r.range(D.far * 0.45, D.far * 0.7); lat = r.sign() * r.range(10, 30); }
                else {
                    ah = initial ? r.range(18, D.far * 0.8) : r.range(D.far * 0.5, D.far * 0.8);
                    const u = r();
                    lat = u < 0.3 ? r.range(-5, 5) : u < 0.7 ? r.range(-22, 22) : r.sign() * r.range(22, 60);
                    if (c.flock) lat = r.sign() * r.range(24, 70);       // flocks wheel beside the course, not across it
                }
                lanePoint(ah, lat, tmpP);
                const h = height(tmpP.x, tmpP.z);
                c.swim = false;
                if (c.sea) ok = swimmable(h);
                else if (c.air || gas) ok = true;
                else if (civ && cityQ(tmpP.x, tmpP.z) < 1.15) ok = false;       // wildlife lives outside the cities
                else if (walkable(h)) ok = true;
                else if ((type === 'ocean' || type === 'earth') && tries >= 8 && !c.big) { ok = true; c.swim = true; }
            }
            c.x = tmpP.x; c.z = tmpP.z;
            c.obj.group.visible = ok;
            c.retry = ok ? 0 : 0.8;
            c.heading = r.range(-Math.PI, Math.PI);
            c.yaw = c.heading;
            c.turn = 0; c.timer = r.range(0, 2); c.hopT = -1; c.pause = 0; c.leap = r.range(1, 6); c.leapT = -1; c.pitch = 0;
            c.alt = c.flock ? r.range(26, 38) : gas ? r.range(4, 10) : r.range(2, 8);
            c.phase = r.range(0, 6.28);
            c.y = creatureY(c, 0, 0);
        }
        function creatureY(c, t, hop) {
            if (c.sea) return seaH - c.height * 0.42 + Math.sin(t * 1.1 + c.phase) * 0.12 + hop;
            if (gas) return height(c.x, c.z) + c.alt + (c.move === 'float' ? 0 : Math.sin(t * 0.6 + c.phase) * 0.8);
            const h = height(c.x, c.z), g = type === 'ice' && hasSea ? Math.max(h, seaH) : h;
            if (c.air) return Math.max(g, seaH) + c.alt + (c.move === 'drift' ? Math.sin(t * 0.6 + c.phase) * 0.8 : 0);
            if (c.swim) return seaH - c.height * 0.3 + Math.sin(t * 1.1 + c.phase) * 0.12;
            return g + hop;
        }
        /**
         * A creature as one static mesh (lit parts) and one unlit mesh (eyes, glowing bits), in its own
         * space with its feet at the origin: the herd copies. Built at the 'tiny' detail.
         */
        function staticCopy(spec) {
            let obj = null;
            try { obj = NSE.Creatures.build(THREE, spec, 'tiny'); } catch (e) { return null; }
            if (!obj || !obj.group) return null;
            try { obj.update(0, 0, false); } catch (e) { /* rest pose */ }
            obj.group.updateMatrixWorld(true);
            const B = { lit: { p: [], n: [], c: [] }, flat: { p: [], n: [], c: [] } };
            const nm = new THREE.Matrix3(), v = new THREE.Vector3();
            obj.group.traverse(function (o) {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
                const g = o.geometry, m = o.material, pos = g.attributes.position, nor = g.attributes.normal, cc = g.attributes.color;
                const glowy = m.isMeshBasicMaterial || (m.emissive && m.emissiveIntensity > 0.5 && m.emissive.r + m.emissive.g + m.emissive.b > 0.05);
                const L = glowy ? B.flat : B.lit;
                const base = m.isMeshBasicMaterial ? m.color : (glowy ? m.emissive : m.color);
                nm.getNormalMatrix(o.matrixWorld);
                const idx = g.index ? g.index.array : null, count = idx ? idx.length : pos.count;
                for (let i = 0; i < count; i++) {
                    const k = idx ? idx[i] : i;
                    v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); L.p.push(v.x, v.y, v.z);
                    if (nor) { v.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize(); L.n.push(v.x, v.y, v.z); } else L.n.push(0, 1, 0);
                    if (m.vertexColors && cc) L.c.push(cc.getX(k) * base.r, cc.getY(k) * base.g, cc.getZ(k) * base.b);
                    else L.c.push(base.r, base.g, base.b);
                }
            });
            const height = obj.height;
            obj.dispose();
            const mk = function (L) {
                if (!L.p.length) return null;
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(L.p, 3));
                g.setAttribute('normal', new THREE.Float32BufferAttribute(L.n, 3));
                g.setAttribute('color', new THREE.Float32BufferAttribute(L.c, 3));
                g.computeBoundingSphere();
                return made(g);
            };
            return { lit: mk(B.lit), flat: mk(B.flat), height: height };
        }
        function clearCreatures() {
            creatures.splice(0).forEach(c => { scene.remove(c.obj.group); try { c.obj.dispose(); } catch (e) { /* ignore */ } });
            herds.splice(0).forEach(function (hd) {
                [hd.mesh, hd.glow].forEach(function (m) { if (m) { scene.remove(m); free(m.geometry); m.material.dispose(); if (m.dispose) m.dispose(); } });
            });
        }
        function makeCreatures() {
            clearCreatures();
            if (!speciesList.length || !NSE.Creatures) return;
            const nSp = speciesList.length;
            // A few full models per species (herd members are the cheap copies).
            const per = Math.max(1, Math.round(D.creatures * 0.6 / nSp));
            const budget = FOLLOWERS[detail] || 30;
            const plan = speciesList.map(function (spec) {
                const so = socialOf(spec);
                const lead = spec.golden || spec.giant ? 1 : (so[0] === 'solo' ? Math.min(per, 2) : per);
                let want = 0;
                for (let k = 0; k < lead; k++) want += so[2] ? crng.int(so[1], so[2]) : 0;
                return { spec: spec, so: so, lead: lead, want: want };
            });
            const totalWant = plan.reduce((n, p) => n + p.want, 0);
            const kf = totalWant > budget ? budget / totalWant : 1;
            plan.forEach(function (p, si) {
                const spec = p.spec, move = spec.move || 'walk';
                const leaders = [];
                for (let k = 0; k < p.lead; k++) {
                    let obj = null;
                    try { obj = NSE.Creatures.build(THREE, spec, detail); } catch (e) { obj = null; }
                    if (!obj || !obj.group) continue;
                    const size = Math.max(0.3, spec.size || obj.height || 1);
                    const c = {
                        spec: spec, si: si, obj: obj, move: move, air: move === 'drift' || move === 'float', sea: move === 'swim',
                        flock: p.so[0] === 'flock' || p.so[0] === 'swarm', big: !!spec.giant,
                        leaps: move === 'swim' && (spec.variant === 'fish' || spec.variant === 'dolphin'),
                        height: obj.height || size, size: size,
                        speed: U.clamp(size * 0.5, 0.4, 3.5) * (move === 'crawl' ? 0.4 : move === 'slither' ? 0.5 : move === 'roll' ? 1.2 : move === 'drift' || move === 'float' ? 0.7 : move === 'swim' ? 0.9 : 1) * (spec.giant ? 0.45 : 1),
                        x: 0, y: 0, z: 0, moving: false
                    };
                    if (c.flock) c.speed = Math.max(c.speed, 3.2);         // a flock keeps up a gentle cruise
                    scene.add(obj.group);
                    placeCreature(c, true);
                    creatures.push(c);
                    leaders.push(c);
                }
                const nf = Math.round(p.want * kf);
                if (!nf || !leaders.length) return;
                const cp = staticCopy(spec);
                if (!cp || !cp.lit) { if (cp && cp.flat) free(cp.flat); return; }
                const mesh = new THREE.InstancedMesh(cp.lit, new THREE.MeshLambertMaterial({ vertexColors: true }), nf);
                const glow = cp.flat ? new THREE.InstancedMesh(cp.flat, new THREE.MeshBasicMaterial({ vertexColors: true }), nf) : null;
                [mesh, glow].forEach(function (m) { if (!m) return; m.frustumCulled = false; if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
                const way = p.so[0], size = Math.max(0.3, spec.size || 1);
                const spread = { herd: 2.5 + size * 2.4, pack: 2 + size * 2, colony: 2 + size * 3, flock: 5 + size * 3, swarm: 3 + size * 2.5, school: 3 + size * 7, pod: 5 + size * 3, drift: 4 + size * 1.6 }[way] || 4;
                const members = [];
                for (let i = 0; i < nf; i++) {
                    const a = crng() * Math.PI * 2, d = spread * (0.35 + 0.65 * Math.sqrt(crng()));
                    const calf = spec.variant === 'whale' && i % 2 === 0;
                    members.push({
                        L: leaders[i % leaders.length], ox: Math.cos(a) * d, oz: Math.sin(a) * d,
                        oy: way === 'flock' || way === 'swarm' ? crng.range(-3, 3) : way === 'drift' ? crng.range(-2, 3) : 0,
                        ph: crng.range(0, 6.28), w: crng.range(0.4, 0.9), amp: way === 'swarm' ? 1.4 : way === 'school' ? 0.8 : 0.5,
                        sc: calf ? 0.5 : way === 'flock' || way === 'swarm' ? crng.range(0.6, 0.88) : crng.range(0.82, 1.1), yj: crng.range(-0.35, 0.35), dir: crng.sign(),
                        leap: crng.range(1, 7), leapT: -1, ld: crng.range(0.9, 1.3), lh: size * crng.range(1.6, 3.2),
                        hopT: crng(), okT: 0, ok: true, x: 0, y: 0, z: 0, vis: false
                    });
                }
                herds.push({
                    spec: spec, si: si, mesh: mesh, glow: glow, members: members, h: cp.height, size: size, way: way,
                    sea: move === 'swim', air: move === 'drift' || move === 'float', hop: move === 'hop',
                    leaps: move === 'swim' && (spec.variant === 'fish' || spec.variant === 'dolphin'), flock: way === 'flock' || way === 'swarm', dir: crng.sign()
                });
            });
            updateHerds(0, time);
        }
        function updateCreatures(dt, t) {
            for (let i = 0; i < creatures.length; i++) {
                const c = creatures[i];
                const along = alongOf(c.x, c.z), lat = latOf(c.x, c.z);
                if (c.retry > 0) c.retry -= dt;
                if (along < -30 || Math.abs(lat) > 110 || along > D.far + 40 || (!c.obj.group.visible && along < D.far * 0.3 && c.retry <= 0)) placeCreature(c, false);
                c.timer -= dt;
                if (c.timer <= 0) { c.turn = crng.range(-0.6, 0.6); c.timer = crng.range(2, 5); if (c.move === 'walk' && crng() < 0.3) c.pause = crng.range(1, 2.5); }
                // Flocks keep clear of the course ahead (they wheel off to the side).
                if (c.flock && along > -10 && along < 90 && Math.abs(lat) < 22) c.turn = lat > 0 ? -0.8 : 0.8;
                c.heading += c.turn * dt;
                let step = 0, hop = 0, moving = true;
                c.pitch = 0;
                if (c.move === 'hop') {
                    if (c.hopT < 0) { c.rest = (c.rest === undefined ? crng.range(0.3, 1.2) : c.rest) - dt; moving = false; if (c.rest <= 0) { c.hopT = 0; c.rest = crng.range(0.6, 1.6); } }
                    else {
                        c.hopT += dt / 0.55;
                        hop = Math.sin(Math.PI * Math.min(1, c.hopT)) * (0.4 * c.size + 0.3);
                        step = (c.size * 1.3 + 0.6) / 0.55 * dt;
                        if (c.hopT >= 1) c.hopT = -1;
                    }
                } else if (c.pause > 0) { c.pause -= dt; moving = false; }
                else step = c.speed * dt;
                // Fish and dolphins leap out of the waves now and then.
                if (c.leaps) {
                    if (c.leapT >= 0) {
                        c.leapT += dt / (c.spec.variant === 'fish' ? 0.9 : 1.3);
                        const u = Math.min(1, c.leapT);
                        hop = Math.sin(Math.PI * u) * c.size * (c.spec.variant === 'fish' ? 3 : 2.6);
                        c.pitch = 0.75 * Math.cos(Math.PI * u);
                        if (c.leapT >= 1) { c.leapT = -1; c.leap = crng.range(3, 8); }
                    } else if ((c.leap -= dt) <= 0) c.leapT = 0;
                }
                let dir = c.heading;
                if (c.move === 'slither') dir += 0.35 * Math.sin(t * 3 + c.phase);
                if (step > 0) {
                    const nx = c.x - Math.sin(dir) * step, nz = c.z - Math.cos(dir) * step;
                    if (c.sea) { if (swimmable(height(nx, nz))) { c.x = nx; c.z = nz; } else { c.heading += Math.PI * 0.6; moving = false; } }
                    else if (!c.air && !gas && !c.swim && !walkable(height(nx, nz))) { c.heading += Math.PI * 0.6; moving = false; }
                    else if (c.swim && walkable(height(nx, nz))) { c.swim = false; c.x = nx; c.z = nz; }
                    else { c.x = nx; c.z = nz; }
                }
                c.moving = moving;
                c.y = creatureY(c, t, hop);
                c.yaw += angleTo(c.yaw, dir) * (1 - Math.exp(-4 * dt));
                const g = c.obj.group;
                g.position.set(c.x, c.y, c.z);
                g.rotation.set(c.pitch, c.yaw, c.flock ? -0.2 * Math.sign(c.turn || 1) : 0, 'YXZ');
                if (c.obj.update) { try { c.obj.update(dt, t, moving); } catch (e) { /* a creature's animation must never stop the flight */ } }
                // The rare ones count as seen once they are close in front of the ship.
                if ((c.spec.golden || c.spec.giant) && g.visible && along > 4) {
                    const range = c.spec.giant ? 170 : 75;
                    if (along < range && Math.abs(lat) < along * 1.1 + 12) seenRare[c.spec.giant ? 'giant' : 'golden'] = true;
                }
            }
        }
        const hM = new THREE.Matrix4(), hQ = new THREE.Quaternion(), hE = new THREE.Euler(), hV = new THREE.Vector3(), hS = new THREE.Vector3(), hZ = new THREE.Matrix4().makeScale(0, 0, 0);
        /** Every herd copy follows its leader in formation (flocks also wheel round it). */
        function updateHerds(dt, t) {
            for (let k = 0; k < herds.length; k++) {
                const hd = herds[k];
                for (let i = 0; i < hd.members.length; i++) {
                    const f = hd.members[i], L = f.L;
                    let show = L.obj.group.visible;
                    if (show) {
                        const spin = hd.flock ? t * 0.3 * (hd.way === 'flock' ? hd.dir : f.dir) : 0;
                        const a = L.yaw + spin;
                        const ca = Math.cos(a), sa = Math.sin(a);
                        const ox = f.ox + Math.sin(t * f.w + f.ph) * f.amp, oz = f.oz + Math.cos(t * f.w * 0.8 + f.ph) * f.amp;
                        f.x = L.x + ox * ca + oz * sa; f.z = L.z - ox * sa + oz * ca;
                        let y, pitch = 0, roll = 0;
                        if (hd.sea) {
                            if ((f.okT -= dt) <= 0) { f.okT = 0.5; f.ok = swimmable(height(f.x, f.z)); }
                            show = f.ok;
                            y = seaH - hd.h * f.sc * 0.42 + Math.sin(t * 1.1 + f.ph) * 0.12;
                            if (hd.leaps) {
                                if (f.leapT >= 0) {
                                    f.leapT += dt / f.ld;
                                    const u = Math.min(1, f.leapT);
                                    y += Math.sin(Math.PI * u) * f.lh;
                                    pitch = 0.75 * Math.cos(Math.PI * u);
                                    if (f.leapT >= 1) { f.leapT = -1; f.leap = crng.range(2.5, 7); }
                                } else if ((f.leap -= dt) <= 0) f.leapT = 0;
                            }
                        } else if (hd.air || gas) {
                            y = L.y + f.oy + Math.sin(t * 1.3 + f.ph) * 0.5;
                            if (hd.flock) roll = -0.28 * (hd.way === 'flock' ? hd.dir : f.dir);
                        } else {
                            const g0 = height(f.x, f.z);
                            show = walkable(g0);
                            y = type === 'ice' && hasSea ? Math.max(g0, seaH) : g0;
                            if (hd.hop) { f.hopT = (f.hopT + dt * 1.2) % 1; y += Math.max(0, Math.sin(f.hopT * Math.PI * 2)) * (0.35 * hd.size + 0.25); }
                            else if (L.moving) y += Math.abs(Math.sin(t * 5 + f.ph)) * 0.04 * hd.size;
                        }
                        f.y = y;
                        if (show) {
                            hQ.setFromEuler(hE.set(pitch, a + f.yj, roll, 'YXZ'));
                            hM.compose(hV.set(f.x, y, f.z), hQ, hS.set(f.sc, f.sc, f.sc));
                        }
                    }
                    f.vis = show;
                    const m = show ? hM : hZ;
                    hd.mesh.setMatrixAt(i, m);
                    if (hd.glow) hd.glow.setMatrixAt(i, m);
                }
                hd.mesh.instanceMatrix.needsUpdate = true;
                if (hd.glow) hd.glow.instanceMatrix.needsUpdate = true;
            }
        }

        // ----- friendly saucers -------------------------------------------------------------------
        const saucers = [];
        if (civ) {
            const body = keepGeo(new THREE.SphereGeometry(2.6, 16, 8)); body.scale(1, 0.3, 1);
            const dome = keepGeo(new THREE.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
            const bulb = keepGeo(new THREE.IcosahedronGeometry(0.22, 0));
            const mBody = keepMat(new THREE.MeshLambertMaterial({ color: 0xc8d0dc }));
            const mDome = keepMat(new THREE.MeshLambertMaterial({ color: 0x9ad8ff, emissive: 0x1a4a6a }));
            const mBulb = keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(winCol[0], winCol[1], winCol[2]) }));
            const n = Math.min(2, Math.max(1, civ.ships || 2));
            const r = U.rng(U.hash(seed, 'saucers'));
            for (let i = 0; i < n; i++) {
                const g = new THREE.Group();
                g.add(new THREE.Mesh(body, mBody));
                const dm = new THREE.Mesh(dome, mDome); dm.position.y = 0.45; g.add(dm);
                for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(bulb, mBulb); b.position.set(Math.cos(k * 0.785) * 2.45, 0, Math.sin(k * 0.785) * 2.45); g.add(b); }
                g.visible = false;
                scene.add(g);
                saucers.push({ g: g, wait: r.range(4, 9) + i * 7, p: -1, side: 1, along: 100, h: 20, dur: 6, r: r, fx: 0, fz: -1 });
            }
        }
        function updateSaucers(dt, t) {
            for (const s of saucers) {
                if (s.p < 0) {
                    s.wait -= dt;
                    if (s.wait <= 0) {
                        s.p = 0; s.side = s.r.sign(); s.along = s.r.range(70, 150); s.h = s.r.range(10, 24); s.dur = s.r.range(5.5, 8);
                        s.fx = fwd.x; s.fz = fwd.z;          // the pass keeps the heading it started with
                    } else { s.g.visible = false; continue; }
                }
                s.p += dt / s.dur;
                if (s.p >= 1) { s.p = -1; s.wait = s.r.range(12, 26); s.g.visible = false; continue; }
                const lat = s.side * (-140 + 280 * s.p), al = s.along - 12 * s.p;
                s.g.visible = true;
                s.g.position.set(shipPos.x + s.fx * al - s.fz * lat, shipPos.y + s.h + 4 * Math.sin(Math.PI * s.p), shipPos.z + s.fz * al + s.fx * lat);
                s.g.rotation.set(0, t * 0.8, 0);
                s.g.rotation.z = -s.side * 0.12;
            }
        }

        // ----- city traffic, trains, drones, sky ships, spaceport launches ------------------------------
        const traffic = [], launchers = [], portsSeen = new Set();
        let trafficBody = null, trafficGlow = null, launches = 0, civTick = 0, nearCities = [], wideCities = [];
        const civSeen = { trains: 0, drones: 0, skyships: 0, domes: 0, beams: 0, climbers: 0 };
        if (civ) {
            const n = { high: 12, standard: 9, low: 5 }[detail];
            const bodyG = made(new THREE.IcosahedronGeometry(1, 1));
            const glowG = made(new THREE.OctahedronGeometry(1, 0));
            trafficBody = new THREE.InstancedMesh(bodyG, keepMat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x202830 })), n);
            trafficGlow = new THREE.InstancedMesh(glowG, keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(winCol[0], winCol[1], winCol[2]) })), n * 2);
            [trafficBody, trafficGlow].forEach(m => { m.frustumCulled = false; if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
            const tr = U.rng(U.hash(seed, 'traffic'));
            const col = new THREE.Color();
            for (let i = 0; i < n; i++) {
                const hue = U.hsl(tr.range(0, 360), tr.range(0.4, 0.7), tr.range(0.6, 0.75));
                trafficBody.setColorAt(i, col.setRGB(hue[0], hue[1], hue[2]).convertSRGBToLinear());
                traffic.push({ city: null, rad: 30, h: 30, a: tr() * 6.28, w: 0.4, dir: tr.sign(), r: tr, x: 0, y: -1e4, z: 0, yaw: 0 });
            }
            // Saucers that lift off from a spaceport as you come near.
            for (let i = 0; i < 2; i++) {
                const g = new THREE.Group();
                g.add(new THREE.Mesh(keepGeo(new THREE.SphereGeometry(2.6, 16, 8).scale(1, 0.3, 1)), keepMat(new THREE.MeshLambertMaterial({ color: 0xd0d6e0 }))));
                const dm = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), keepMat(new THREE.MeshLambertMaterial({ color: 0x9ad8ff, emissive: 0x1a4a6a })));
                dm.position.y = 0.45; g.add(dm);
                const ring = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(2.5, 0.18, 4, 16).rotateX(Math.PI / 2)), keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(winCol[0], winCol[1], winCol[2]) })));
                g.add(ring);
                g.visible = false;
                scene.add(g);
                launchers.push({ g: g, t: -1, x: 0, z: 0, y0: 0, dx: 0, dz: 0 });
            }
        }
        const civColor = civ ? new THREE.Color(winCol[0], winCol[1], winCol[2]) : null;
        const instanced = (geo, mat, n) => {
            const m = new THREE.InstancedMesh(keepGeo(geo), keepMat(mat), n);
            m.frustumCulled = false;
            if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            tmpM0.makeScale(0, 0, 0);
            for (let i = 0; i < n; i++) m.setMatrixAt(i, tmpM0);
            scene.add(m);
            return m;
        };
        const tmpM0 = new THREE.Matrix4();
        // Maglev trains: four cars gliding along the rails between the cities near the ship.
        const TRAINS = 3, CARS = 4, TRAIN_V = 26;
        const trains = [];
        let carBody = null, carGlow = null;
        if (civ && TECH.maglev) {
            carBody = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(...mixc(civWalls[0], WHITE, 0.55)) }), TRAINS * CARS);
            carGlow = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: civColor }), TRAINS * CARS);
            for (let i = 0; i < TRAINS; i++) trains.push({ link: null, phase: 0 });
        }
        // Drones: little craft with a light, buzzing round the cities.
        const drones = [];
        let droneBody = null, droneLight = null;
        if (civ && TECH.drones) {
            const n = { high: 22, standard: 14, low: 8 }[detail];
            droneBody = instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(...mixc(civWalls[1], WHITE, 0.4)) }), n);
            droneLight = instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: civColor }), n);
            const dr = U.rng(U.hash(seed, 'drones'));
            for (let i = 0; i < n; i++) drones.push({ city: null, rad: 20, h: 20, a: dr() * 6.28, w: dr.range(0.25, 0.6) * dr.sign(), ph: dr() * 6.28, r: dr });
        }
        // Great sky ships drifting slowly across, high up.
        const skyships = [];
        const skyR = U.rng(U.hash(seed, 'skyships'));
        if (civ && TECH.skyships) {
            const S = new Builder(), G = new Builder();
            const hull0 = mixc(civWalls[1], WHITE, 0.25), hull1 = mixc(civWalls[1], WHITE, 0.62), acc = mixc(civRoof, civWalls[0], 0.3);
            const sph = new THREE.SphereGeometry(1, 14, 9).toNonIndexed();
            const sp = sph.attributes.position.array, sys = new Float32Array(sp.length / 3);
            for (let i = 0; i < sys.length; i++) sys[i] = (sp[i * 3 + 1] + 1) / 2;
            const SPH = { p: new Float32Array(sp), ys: sys };
            sph.dispose();
            const add = (B, tpl, x, y, z, sx, sy, sz, rx, c0, c1) => { q.setFromEuler(eul.set(rx || 0, 0, 0)); mtx.compose(vp.set(x, y, z), q, vs.set(sx, sy, sz)); B.add(tpl, mtx.elements, c0, c1 || c0); };
            add(S, SPH, 0, 0, 0, 6.2, 5.4, 22, 0, scl(hull0, 0.85), hull1);                // the envelope
            add(S, T.box, 0, -7.2, -1, 4.2, 2.8, 11, 0, scl(acc, 0.8), acc);              // the gondola
            add(G, T.box, 0, -6.4, -1, 4.3, 0.7, 10, 0, winCol, winCol);                  // its windows
            add(S, T.box, 0, 2, 17, 0.5, 6.5, 6.5, 0, acc, hull1);                        // tail fins
            add(S, T.box, 0, -0.3, 17, 13.5, 0.5, 6.5, 0, acc, hull1);
            [-1, 1].forEach(function (s) {
                add(S, T.cyl8, s * 7.6, -3.3, 1, 1.1, 4, 1.1, Math.PI / 2, acc, hull1);  // engine pods
                add(S, T.box, s * 4.6, -4.2, 2.4, 5, 0.5, 1, 0, acc, acc);
                add(G, T.octa, s * 7.6, -3.3, 5.3, 0.9, 0.9, 0.9, 0, winCol, WHITE);
                for (let k = -3; k <= 3; k++) {
                    const zz = k * 3, xx = 6.2 * Math.sqrt(1 - (zz / 22) * (zz / 22)) * 1.01;
                    add(G, T.box, s * xx, -0.9, zz, 0.12, 0.7, 1.7, 0, winCol, winCol);
                }
            });
            add(G, T.octa, 0, 0, -22.3, 0.8, 0.8, 0.8, 0, winCol, WHITE);
            const gS = keepGeo(S.build(THREE)), gG = keepGeo(G.build(THREE));
            const mShip = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true }));
            const n = { high: 3, standard: 2, low: 1 }[detail];
            for (let i = 0; i < n; i++) {
                const g = new THREE.Group();
                g.add(new THREE.Mesh(gS, mShip), new THREE.Mesh(gG, matGlow));
                g.visible = false;
                scene.add(g);
                skyships.push({ g: g, t: -1, wait: 2 + i * 14, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, ph: skyR() * 6.28 });
            }
        }
        // The great domes' glass (one see-through shell per dome near the ship) and the beacons' beams.
        const domePool = [], beamPool = [];
        let beamMat = null;
        if (civ && CSTYLE === 'domes') {
            const geo = keepGeo(new THREE.SphereGeometry(1, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2));
            const glass = keepMat(new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(...mixc(winCol, lin('#bfe4ff'), 0.6)), emissive: new THREE.Color().setRGB(...scl(winCol, 0.16)), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
            // A geodesic frame over the glass: the top half of a subdivided icosahedron, drawn as lines.
            const ico0 = new THREE.IcosahedronGeometry(1, 2), ico = ico0.index ? ico0.toNonIndexed() : ico0, ip = ico.attributes.position.array, keep = [];
            for (let t = 0; t < ip.length; t += 9) if (ip[t + 1] + ip[t + 4] + ip[t + 7] > -0.05) for (let k = 0; k < 9; k++) keep.push(ip[t + k]);
            ico.dispose(); ico0.dispose();
            const frameGeo = keepGeo(new THREE.BufferGeometry());
            frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
            const frameMat = keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...mixc(civTrim, WHITE, 0.3)), wireframe: true, transparent: true, opacity: 0.55, depthWrite: false }));
            for (let i = 0; i < 4; i++) {
                const m = new THREE.Mesh(geo, glass); m.visible = false; m.renderOrder = 2; scene.add(m);
                const f = new THREE.Mesh(frameGeo, frameMat); f.visible = false; f.renderOrder = 2; scene.add(f);
                m.userData.frame = f;
                domePool.push(m);
            }
        }
        if (civ && TECH.beacons) {
            const geo = keepGeo(new THREE.CylinderGeometry(1.1, 1.5, 1, 8, 4, true).translate(0, 0.5, 0));
            const bpos = geo.attributes.position, bcol = new Float32Array(bpos.count * 4);
            for (let i = 0; i < bpos.count; i++) { const t = bpos.getY(i); bcol[i * 4] = winCol[0]; bcol[i * 4 + 1] = winCol[1]; bcol[i * 4 + 2] = winCol[2]; bcol[i * 4 + 3] = Math.pow(1 - t, 2.2); }
            geo.setAttribute('color', new THREE.BufferAttribute(bcol, 4));
            beamMat = keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
            for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(geo, beamMat); m.visible = false; m.renderOrder = 3; scene.add(m); beamPool.push(m); }
        }
        // In the sky (it moves with the camera, so these sit far away): the space elevator's tether
        // rising out of the haze with climbers on it, and the orbital ring as a pale arch.
        const civSky = { tether: null, ring: null, climbers: [] };
        if (civ && TECH.elevator) {
            const az = 0.42, dir = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az)), D0 = 560, H = 760, B0 = -45;
            const tcol = mixc(lin('#6c7894'), winCol, 0.15);
            const tube = (r, alpha, haze) => {
                const g = keepGeo(new THREE.CylinderGeometry(r, r, H, 6, 10, true).translate(0, B0 + H / 2, 0));
                const pos = g.attributes.position, cols = new Float32Array(pos.count * 4);
                for (let i = 0; i < pos.count; i++) {
                    const t = (pos.getY(i) - B0) / H;
                    const c = mixc(haze ? tcol : winCol, skyHor, 0.6 * (1 - U.smooth(t * 3)));
                    cols[i * 4] = c[0]; cols[i * 4 + 1] = c[1]; cols[i * 4 + 2] = c[2];
                    cols[i * 4 + 3] = alpha * U.smooth(t * 12) * (1 - U.smooth((t - 0.62) / 0.38));
                }
                g.setAttribute('color', new THREE.BufferAttribute(cols, 4));
                return g;
            };
            const tether = new THREE.Mesh(tube(3.4, 0.95, true), keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false })));
            const sheath = new THREE.Mesh(tube(1.6, 0.9, false), keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
            const mid = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(16, 2.6, 6, 28).rotateX(Math.PI / 2)), keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...mixc(tcol, skyHor, 0.3)), fog: false, transparent: true, opacity: 0.9, depthWrite: false })));
            const midGlow = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(16.4, 0.9, 4, 28).rotateX(Math.PI / 2)), keepMat(new THREE.MeshBasicMaterial({ color: civColor, fog: false, transparent: true, depthWrite: false })));
            [tether, sheath, mid, midGlow].forEach(m => { m.position.copy(dir).multiplyScalar(D0); m.renderOrder = -8; m.frustumCulled = false; skyGroup.add(m); });
            mid.position.y = midGlow.position.y = 165;
            const cg = keepGeo(new THREE.BoxGeometry(5, 9, 5));
            for (let i = 0; i < 3; i++) {
                const m = new THREE.Mesh(cg, keepMat(new THREE.MeshBasicMaterial({ color: civColor, fog: false, transparent: true, depthWrite: false })));
                m.position.copy(dir).multiplyScalar(D0);
                m.renderOrder = -7;
                m.frustumCulled = false;
                skyGroup.add(m);
                civSky.climbers.push({ m: m, ph: i * 213, up: i !== 1 });
            }
            civSky.tether = tether;
        }
        if (civ && TECH.ring) {
            const E = 0.27, grp = new THREE.Group();
            grp.rotation.y = -0.22;
            const ringCol = mixc(lin('#7e8aa6'), winCol, 0.12);
            const band = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(600, 3.6, 4, 128, Math.PI)), keepMat(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...ringCol), transparent: true, opacity: airless ? 0.9 : 0.62, depthWrite: false, fog: false })));
            const core = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(600, 1.0, 3, 128, Math.PI)), keepMat(new THREE.MeshBasicMaterial({ color: civColor, transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
            const bp = new Float32Array(26 * 3);
            for (let i = 0; i < 26; i++) { const a = (i + 0.5) / 26 * Math.PI; bp[i * 3] = Math.cos(a) * 600; bp[i * 3 + 1] = Math.sin(a) * 600; bp[i * 3 + 2] = 4; }
            const bg = keepGeo(new THREE.BufferGeometry());
            bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
            const beads = new THREE.Points(bg, keepMat(new THREE.PointsMaterial({ color: civColor, size: 4, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false })));
            [band, core, beads].forEach(m => { m.rotation.x = E - Math.PI / 2; m.renderOrder = -8; m.frustumCulled = false; grp.add(m); });
            skyGroup.add(grp);
            civSky.ring = grp;
        }

        const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
        /** The links near the ship (nearest first), for the trains. */
        function linksNear(R) {
            const out = [], m = CITY.size;
            const cx = Math.floor(shipPos.x / m), cz = Math.floor(shipPos.z / m);
            for (let gz = cz - 2; gz <= cz + 1; gz++) for (let gx = cx - 2; gx <= cx + 1; gx++) for (let dir = 0; dir < 2; dir++) {
                const L = linkOf(gx, gz, dir);
                if (!L) continue;
                const t = U.clamp((shipPos.x - L.sx) * L.ux + (shipPos.z - L.sz) * L.uz, 0, L.len);
                const dd = Math.hypot(L.sx + L.ux * t - shipPos.x, L.sz + L.uz * t - shipPos.z);
                if (dd < R) out.push([dd, L]);
            }
            out.sort((a, b) => a[0] - b[0]);
            return out.map(o => o[1]);
        }
        function hideInst(m, i) { tmpM.makeScale(0, 0, 0); m.setMatrixAt(i, tmpM); }
        function updateTrains(t) {
            if (!carBody) return;
            let shown = 0;
            for (let i = 0; i < trains.length; i++) {
                const tr = trains[i], L = tr.link;
                for (let k = 0; k < CARS; k++) {
                    const j = i * CARS + k;
                    if (!L) { hideInst(carBody, j); hideInst(carGlow, j); continue; }
                    const span = L.len * 2, tt = ((t * TRAIN_V + tr.phase) % span + span) % span;
                    const s = tt < L.len ? tt : span - tt, dirS = tt < L.len ? 1 : -1;
                    const sk = s - dirS * k * 9.6;
                    if (sk < 1 || sk > L.len - 1) { hideInst(carBody, j); hideInst(carGlow, j); continue; }
                    const y = railY(L, sk) + 0.15, p = Math.atan2(railY(L, Math.min(L.len, sk + 3)) - railY(L, Math.max(0, sk - 3)), 6);
                    const x = L.sx + L.ux * sk, z = L.sz + L.uz * sk;
                    tmpQ.setFromEuler(tmpE.set(-p, L.yaw, 0, 'YXZ'));
                    tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(2.3, 2.1, 8.6));
                    carBody.setMatrixAt(j, tmpM);
                    tmpM.compose(tmpV.set(x, y + 1, z), tmpQ, tmpS.set(2.36, 0.55, 8));
                    carGlow.setMatrixAt(j, tmpM);
                    shown++;
                }
            }
            carBody.instanceMatrix.needsUpdate = true;
            carGlow.instanceMatrix.needsUpdate = true;
            if (shown) civSeen.trains++;
        }
        function updateDrones(dt, t) {
            if (!droneBody) return;
            let shown = 0;
            for (let i = 0; i < drones.length; i++) {
                const c = drones[i];
                if (!c.city || nearCities.indexOf(c.city) < 0) {
                    c.city = nearCities.length ? nearCities[i % Math.min(4, nearCities.length)] : null;
                    if (c.city) { c.rad = Math.max(c.city.tMin * 0.9, c.r.range(0.15, 0.9) * c.city.r); c.h = c.r.range(c.city.tLo - 8, c.city.tHi - 4); }
                }
                if (!c.city) { hideInst(droneBody, i); hideInst(droneLight, i); continue; }
                c.a += c.w * dt;
                const x = c.city.x + Math.cos(c.a) * c.rad + Math.sin(c.a * 2.3 + c.ph) * 6;
                const z = c.city.z + Math.sin(c.a) * c.rad + Math.cos(c.a * 1.7 + c.ph) * 6;
                const y = c.city.gy + Math.max(10, c.h) + Math.sin(t * 1.3 + c.ph) * 1.6;
                if (Math.hypot(x - shipPos.x, y - shipPos.y, z - shipPos.z) < 10) { hideInst(droneBody, i); hideInst(droneLight, i); continue; }
                tmpQ.setFromEuler(tmpE.set(0, t * 2 + c.ph, 0));
                tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(0.9, 0.32, 0.9));
                droneBody.setMatrixAt(i, tmpM);
                tmpM.compose(tmpV.set(x, y - 0.35, z), tmpQ, tmpS.set(0.26, 0.26, 0.26));
                droneLight.setMatrixAt(i, tmpM);
                shown++;
            }
            droneBody.instanceMatrix.needsUpdate = true;
            droneLight.instanceMatrix.needsUpdate = true;
            if (shown >= 4) civSeen.drones++;
        }
        function updateSkyships(dt, t) {
            let shown = 0;
            for (const s of skyships) {
                if (s.t < 0) {
                    s.wait -= dt;
                    if (s.wait > 0) { s.g.visible = false; continue; }
                    // Come into view far ahead and off to one side, high up, and drift slowly across.
                    const side = skyR.sign();
                    aheadPoint(skyR.range(220, 380), side * skyR.range(50, 190), tmpP);
                    s.x = tmpP.x; s.z = tmpP.z;
                    s.y = (gas ? height(s.x, s.z) + 80 : Math.max(ground(s.x, s.z), obstacleTop(s.x, s.z)) + skyR.range(72, 100));
                    const sp = skyR.range(4, 7), fw = skyR.range(-1.5, 1.5);
                    s.vx = -rgt.x * side * sp + fwd.x * fw; s.vz = -rgt.z * side * sp + fwd.z * fw;
                    s.yaw = Math.atan2(-s.vx, -s.vz);
                    s.t = 0;
                }
                s.t += dt;
                s.x += s.vx * dt; s.z += s.vz * dt;
                const al = alongOf(s.x, s.z), lt = latOf(s.x, s.z);
                if (al < -170 || Math.abs(lt) > 380 || s.t > 150) { s.t = -1; s.wait = skyR.range(8, 22); s.g.visible = false; continue; }
                s.g.visible = true;
                s.g.position.set(s.x, s.y + Math.sin(t * 0.25 + s.ph) * 1.2, s.z);
                s.g.rotation.set(0, s.yaw, Math.sin(t * 0.2 + s.ph) * 0.025);
                shown++;
            }
            if (shown) civSeen.skyships++;
        }
        function updateCivSky(t) {
            if (!civSky.climbers.length) return;
            const calm = NSE.Settings && NSE.Settings.calm ? NSE.Settings.calm() : false;
            civSky.climbers.forEach(function (c) {
                const u = ((t * (calm ? 10 : 16) + c.ph) % 600) / 600;
                c.m.position.y = -10 + (c.up ? u : 1 - u) * 600;
                c.m.material.opacity = U.smooth(u * 8) * (1 - U.smooth((u - 0.8) / 0.2));
            });
            civSeen.climbers++;
        }
        function updateCiv(dt, t) {
            if (!civ) return;
            if (civTick-- <= 0) {
                civTick = 15;
                // Cities near enough for traffic (nearest first, ahead preferred).
                nearCities = citiesNear(shipPos.x - 520, shipPos.z - 520, shipPos.x + 520, shipPos.z + 520, [])
                    .filter(pl => Math.hypot(pl.x - shipPos.x, pl.z - shipPos.z) < 520 && alongOf(pl.x, pl.z) > -120)
                    .sort((a, b) => Math.hypot(a.x - shipPos.x, a.z - shipPos.z) - Math.hypot(b.x - shipPos.x, b.z - shipPos.z));
                // Spaceports: count the ones we pass, and launch a saucer from each as we come near.
                const gx = Math.floor(shipPos.x / PORT.size), gz = Math.floor(shipPos.z / PORT.size);
                for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                    const pp = portPlan(gx + i, gz + j);
                    if (!pp) continue;
                    const dd = Math.hypot(pp.x - shipPos.x, pp.z - shipPos.z);
                    if (dd < 420) portsSeen.add(pp.id);
                    if (!pp.launched && dd < 380 && alongOf(pp.x, pp.z) > 30) {
                        const L = launchers.find(l => l.t < 0);
                        if (L) {
                            pp.launched = true; launches++;
                            L.t = 0; L.x = pp.x; L.z = pp.z; L.y0 = pp.top + 1.2;
                            const a = U.hash(pp.id) % 628 / 100; L.dx = Math.cos(a); L.dz = Math.sin(a);
                        }
                    }
                }
                // The domes' glass and the beacons' beams, for the cities in view.
                if (domePool.length || beamPool.length) {
                    const R = D.far + 140;
                    wideCities = citiesNear(shipPos.x - R, shipPos.z - R, shipPos.x + R, shipPos.z + R, []).filter(pl => Math.hypot(pl.x - shipPos.x, pl.z - shipPos.z) < R);
                    let di = 0, bi = 0;
                    wideCities.forEach(function (pl) {
                        if (pl.dome && di < domePool.length) { const m = domePool[di++], f = m.userData.frame; m.visible = f.visible = true; m.position.set(pl.x, pl.dome.base, pl.z); m.scale.set(pl.dome.R, pl.dome.H, pl.dome.R); f.position.copy(m.position); f.scale.set(pl.dome.R * 1.01, pl.dome.H * 1.01, pl.dome.R * 1.01); }
                        pl.beacons.forEach(function (bc) {
                            if (bc.top === null || bi >= beamPool.length) return;
                            const m = beamPool[bi++];
                            m.visible = true; m.position.set(bc.x, bc.top + 1.4, bc.z); m.scale.set(1.3, 170, 1.3);
                        });
                    });
                    for (; di < domePool.length; di++) domePool[di].visible = domePool[di].userData.frame.visible = false;
                    for (; bi < beamPool.length; bi++) beamPool[bi].visible = false;
                }
                // Trains on the nearest lines.
                if (carBody) {
                    const near = linksNear(480);
                    trains.forEach(function (tr, i) {
                        if (tr.link && near.indexOf(tr.link) >= 0) return;
                        tr.link = near.find(L => !trains.some(o => o !== tr && o.link === L)) || null;
                        if (tr.link) tr.phase = (U.hash(tr.link.id) % 1000) / 1000 * tr.link.len * 2;
                    });
                }
            }
            for (let i = 0; i < traffic.length; i++) {
                const c = traffic[i];
                if (!c.city || nearCities.indexOf(c.city) < 0) {
                    c.city = nearCities.length ? nearCities[i % Math.min(3, nearCities.length)] : null;
                    if (c.city) { c.rad = Math.max(c.city.tMin, c.r.range(0.3, 0.95) * c.city.r); c.h = c.r.range(c.city.tLo, c.city.tHi); c.w = c.r.range(11, 19) / c.rad; c.a = c.r() * 6.28; }
                }
                if (!c.city) { c.y = -1e4; tmpM.makeScale(0, 0, 0); trafficBody.setMatrixAt(i, tmpM); trafficGlow.setMatrixAt(i * 2, tmpM); trafficGlow.setMatrixAt(i * 2 + 1, tmpM); continue; }
                c.a += c.w * c.dir * dt;
                const tx = -Math.sin(c.a) * c.dir, tz = Math.cos(c.a) * c.dir;
                c.x = c.city.x + Math.cos(c.a) * c.rad; c.z = c.city.z + Math.sin(c.a) * c.rad;
                c.y = c.city.gy + c.h + 2 * Math.sin(c.a * 2);
                c.yaw = Math.atan2(-tx, -tz);
                tmpQ.setFromEuler(tmpE.set(0, c.yaw, -c.dir * 0.25, 'YXZ'));
                tmpM.compose(tmpV.set(c.x, c.y, c.z), tmpQ, tmpS.set(1.1, 0.45, 2.1));
                trafficBody.setMatrixAt(i, tmpM);
                tmpM.compose(tmpV.set(c.x - tx * 2.1, c.y, c.z - tz * 2.1), tmpQ, tmpS.set(0.35, 0.3, 0.5));
                trafficGlow.setMatrixAt(i * 2, tmpM);
                tmpM.compose(tmpV.set(c.x + tx * 1.9, c.y + 0.1, c.z + tz * 1.9), tmpQ, tmpS.set(0.22, 0.22, 0.22));
                trafficGlow.setMatrixAt(i * 2 + 1, tmpM);
            }
            trafficBody.instanceMatrix.needsUpdate = true;
            trafficGlow.instanceMatrix.needsUpdate = true;
            if (trafficBody.instanceColor) trafficBody.instanceColor.needsUpdate = civTick === 15;
            for (const L of launchers) {
                if (L.t < 0) continue;
                L.t += dt;
                const u = L.t / 11;
                if (u >= 1) { L.t = -1; L.g.visible = false; continue; }
                // Lift gently off the pad, hover a moment, then climb away.
                const rise = u < 0.2 ? 6 * U.smooth(u / 0.2) : 6 + 150 * Math.pow((u - 0.2) / 0.8, 1.8);
                const drift = u < 0.2 ? 0 : 60 * Math.pow((u - 0.2) / 0.8, 2);
                L.g.visible = true;
                L.g.position.set(L.x + L.dx * drift, L.y0 + rise, L.z + L.dz * drift);
                L.g.rotation.set(0, t * 1.2, 0);
            }
            updateTrains(t);
            updateDrones(dt, t);
            updateSkyships(dt, t);
            updateCivSky(t);
            if (beamMat) beamMat.opacity = 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.9));       // a slow, soft breathing
            if (domePool.some(m => m.visible)) civSeen.domes++;
            if (beamPool.some(m => m.visible)) civSeen.beams++;
        }

        // ----- the flight -------------------------------------------------------------------------
        /** Look ahead along the course (as it is turning now, and along the steer target): climb early. */
        function altitudeTarget() {
            let top = -Infinity;
            const n = Math.ceil(10 * Math.max(1, speedK)), slack = 0.55 / speedK, v = BASE_SPEED * speedK;
            const kappa = yawRate / v;
            const remain = Math.abs(headT - headB) + 0.25;
            for (let pass = 0; pass < 2; pass++) {
                let px = shipPos.x, pz = shipPos.z, h = yaw, turned = 0;
                const hT = headT + wander(d);
                for (let k = 0; k <= n; k++) {
                    const sx = Math.cos(h) * 5, sz = -Math.sin(h) * 5;
                    const g = Math.max(ground(px, pz), ground(px + sx, pz + sz), ground(px - sx, pz - sz),
                        obstacleTop(px, pz)) - k * 8 * slack;
                    if (g > top) top = g;
                    if (pass === 0) { const dh = U.clamp(kappa * 8, -0.3, 0.3); if (Math.abs(turned + dh) <= remain) { h += dh; turned += dh; } }
                    else h += angleTo(h, hT) * 0.25;
                    px -= Math.sin(h) * 8; pz -= Math.cos(h) * 8;
                }
            }
            let target = top + 10 + 2 * Math.sin(d / 110 + clearPhase);
            for (let i = 0; i < creatures.length; i++) {
                const c = creatures[i];
                if (!c.obj.group.visible) continue;
                const along = alongOf(c.x, c.z);
                if (c.y > target + 3) continue;          // flying high above the course: the ship passes beneath
                if (along > -6 && along < 45 && Math.abs(latOf(c.x, c.z)) < 8) target = Math.max(target, c.y + c.height + 4.5);
            }
            return target;
        }
        function poseShip(dt) {
            setFrame();
            const v = BASE_SPEED * speedK;
            const bankT = U.clamp(Math.atan(v * yawRate / 9.8) * 1.3, -0.55, 0.55);
            const target = altitudeTarget();
            if (dt <= 0) { shipPos.y = target; tgtS = target; vy = 0; }
            else {
                // Smoothed target (rises quickly, settles slowly), then a vertical speed that changes
                // with limited acceleration: no bobbing, no jumps.
                tgtS = U.approach(tgtS, target, target > tgtS ? 6 : 1.5, dt);
                const above = shipPos.y - ground(shipPos.x, shipPos.z);
                const sinkMax = (12 + Math.max(0, above - 20) * 0.6) * speedK, climbMax = 16 * speedK;
                let want = U.clamp((tgtS - shipPos.y) * 2.6 * Math.max(1, speedK), -sinkMax, climbMax);
                // Close to the ground or to something tall: climb now (gently, before the hard floor).
                if (above < 7 || shipPos.y < obstacleTop(shipPos.x, shipPos.z) + 3) want = Math.max(want, climbMax * U.clamp((7.5 - above) / 2.5, 0.4, 1));
                const acc = (want > vy ? 30 : 16) * Math.max(1, speedK);
                vy += U.clamp(want - vy, -acc * dt, acc * dt);
                shipPos.y += vy * dt;
            }
            const floor = ground(shipPos.x, shipPos.z) + 5;
            if (shipPos.y < floor) { shipPos.y = floor; if (vy < 0) vy = 0; }
            if (dt > 0) {
                bank = U.approach(bank, bankT, 2.2, dt);
                pitch = U.approach(pitch, U.clamp(Math.atan2(vy, v) * 0.8, -0.2, 0.25), 2, dt);
            } else { bank = bankT; }
            ship.position.copy(shipPos);
            ship.position.y += introLift();
            ship.rotation.set(pitch + introPitch(), yaw, bank, 'YXZ');
            skyGroup.position.copy(shipPos);
        }

        // ----- the way in and out -------------------------------------------------------------------
        // Fly Low starts with the ship diving down out of the sky (through the cloud layer) and
        // levelling out over the ground; Back to Orbit is the same climb, nose up. The camera rides
        // with the ship the whole way, so the ship never drops out of the picture.
        // intro: 0 high up .. 1 skimming; introRate: how fast it is changing (+ coming down).
        const INTRO_H = 75;
        let intro = 1, introRate = 0;
        function introLift() { return intro >= 1 ? 0 : INTRO_H * (1 - U.smooth(intro)); }
        /** The nose follows the path: down on the way down, up on the climb (radians, + nose up). */
        function introPitch() {
            if (intro >= 1 || !introRate) return 0;
            const k = U.clamp(intro, 0.01, 0.99), dk = 0.01;
            const drop = INTRO_H * (U.smooth(k + dk) - U.smooth(k - dk)) / (2 * dk) * introRate;
            return -U.clamp(Math.atan(drop / Math.max(6, BASE_SPEED * speedK)) * 0.7, -0.55, 0.55);
        }
        function setIntro(k, rate) {
            intro = U.clamp(+k, 0, 1);
            if (!(intro >= 0)) intro = 1;
            introRate = intro >= 1 ? 0 : (+rate || 0);
        }

        function update(dt, t) {
            dt = U.clamp(+dt || 0, 0, 0.1);
            time = t === undefined ? time + dt : t;
            lastDt = dt;
            if (dt > 0 && speedK !== speedT) {        // speed changes ease in over about a second
                speedK = U.approach(speedK, speedT, 2.5, dt);
                if (Math.abs(speedK - speedT) < 0.01) speedK = speedT;
            }
            const v = BASE_SPEED * speedK;
            if (dt > 0) {
                // Heading spring toward the steer target: one press = a smooth ~1.5 s turn.
                headBV += (STEER_W * STEER_W * (headT - headB) - 2 * STEER_W * headBV) * dt;
                headB += headBV * dt;
                yaw = headB + wander(d);
                yawRate = headBV + wanderD(d) * v;
                shipPos.x -= Math.sin(yaw) * v * dt;
                shipPos.z -= Math.cos(yaw) * v * dt;
                d += v * dt;
            }
            poseShip(dt);
            if (++laneTick >= 10) { laneTick = 0; predictLane(); }
            stream(D.budget);
            updateWater(time);
            updateCreatures(dt, time);
            updateHerds(dt, time);
            updateCover();
            if (rainbow && !seenRare.rainbow && intro >= 1 && fwd.x * -Math.sin(rainbowAz) + fwd.z * -Math.cos(rainbowAz) > 0.7) seenRare.rainbow = true;
            for (let i = 0; i < puffSets.length; i++) puffSets[i].update(dt);
            updateSaucers(dt, time);
            updateCiv(dt, time);
        }

        function steer(dir) {
            dir = +dir || 0;
            if (!dir) return true;
            headT += (dir > 0 ? 1 : -1) * STEP;
            predictLane();
            relane = true;
            return true;
        }

        // ----- views ------------------------------------------------------------------------------
        // Camera state eases with a critically damped spring: starts and stops gently, never snaps.
        const camS = { v: [0, 5.8, 15.5, 0, 0.2, -26, 62, 0], w: [0, 0, 0, 0, 0, 0, 0, 0], init: false, off: [0, 5.8, 15.5], look: [0, 0.2, -26], fov: 62, roll: 0 };
        const CAM_W = 2.6;
        let camLift = 0;
        const cw = new THREE.Vector3(), lw = new THREE.Vector3();
        function toWorld(o, out) {
            const c = Math.cos(yaw), s = Math.sin(yaw);
            let y = o[1], z = o[2];
            if (intro < 1) {
                // On the way in or out: the camera tips with the ship (behind it on its path) and rises with it.
                const a = introPitch() * 0.8, ca = Math.cos(a), sa = Math.sin(a);
                const y2 = y * ca - z * sa;
                z = y * sa + z * ca;
                y = y2 + introLift();
            }
            return out.set(shipPos.x + o[0] * c + z * s, shipPos.y + y, shipPos.z - o[0] * s + z * c);
        }
        function setView(view, camera) {
            const V = VIEWS[view] || VIEWS.chase;
            const off = [V.off[0] + (V.drift ? Math.sin(time * 0.09) * V.drift : 0), V.off[1], V.off[2]];
            const target = [off[0], off[1], off[2], V.look[0], V.look[1], V.look[2], V.fov, V.roll];
            const sv = camS.v, sw = camS.w;
            if (!camS.init) { for (let i = 0; i < 8; i++) { sv[i] = target[i]; sw[i] = 0; } camS.init = true; }
            else if (lastDt > 0) {
                for (let i = 0; i < 8; i++) {
                    sw[i] += (CAM_W * CAM_W * (target[i] - sv[i]) - 2 * CAM_W * sw[i]) * lastDt;
                    sv[i] += sw[i] * lastDt;
                }
            }
            for (let i = 0; i < 3; i++) { camS.off[i] = sv[i]; camS.look[i] = sv[i + 3]; }
            camS.fov = sv[6]; camS.roll = sv[7];
            if (!camera) return;
            toWorld(camS.off, cw);
            // Never underground: lift at once when needed, let the lift go gently.
            const need = Math.max(0, ground(cw.x, cw.z) + 2.2 - cw.y);
            camLift = Math.max(need, lastDt > 0 ? U.approach(camLift, need, 2.5, lastDt) : need);
            cw.y += camLift;
            toWorld(camS.look, lw);
            camera.position.copy(cw);
            camera.up.set(0, 1, 0);
            camera.lookAt(lw);
            if (camS.roll) camera.rotateZ(bank * camS.roll);
            if (camera.isPerspectiveCamera) {
                camera.fov = camS.fov;
                camera.near = 0.25;
                camera.far = SKY_R * 1.4;
                camera.updateProjectionMatrix();
            }
            ship.visible = Math.hypot(camS.off[0], camS.off[1], camS.off[2]) > 4.8;
            skyGroup.position.copy(cw);
        }

        function nearestCreature() {
            let best = null, bd = Infinity;
            for (let i = 0; i < creatures.length; i++) {
                const c = creatures[i];
                if (!c.obj.group.visible || alongOf(c.x, c.z) < -8) continue;
                const dist = Math.hypot(c.x - shipPos.x, c.y - shipPos.y, c.z - shipPos.z);
                if (dist < bd) { bd = dist; best = c; }
            }
            let bh = null, bf = null;
            for (let k = 0; k < herds.length; k++) {
                const hd = herds[k];
                for (let i = 0; i < hd.members.length; i++) {
                    const f = hd.members[i];
                    if (!f.vis || alongOf(f.x, f.z) < -8) continue;
                    const dist = Math.hypot(f.x - shipPos.x, f.y - shipPos.y, f.z - shipPos.z);
                    if (dist < bd) { bd = dist; bh = hd; bf = f; best = null; }
                }
            }
            if (bh) return { spec: bh.spec, index: bh.si, distance: bd, dist: bd, position: new THREE.Vector3(bf.x, bf.y, bf.z) };
            return best ? { spec: best.spec, index: best.si, distance: bd, dist: bd, position: new THREE.Vector3(best.x, best.y, best.z) } : null;
        }

        /** The nearest plant ahead of (or just beside) the ship: { spec, index, distance, position } or null. */
        function nearestPlant() {
            if (!FLORA_ON) return null;
            let bd = Infinity, bi = -1, bx = 0, by = 0, bz = 0;
            const gx = Math.floor(shipPos.x / CS), gz = Math.floor(shipPos.z / CS);
            for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
                const ch = chunks.get((gx + i) + ',' + (gz + j));
                if (!ch || !ch.plants) continue;
                const pl = ch.plants;
                for (let k = 0; k < pl.length; k += 4) {
                    if (alongOf(pl[k], pl[k + 1]) < -8) continue;
                    const dist = Math.hypot(pl[k] - shipPos.x, pl[k + 2] - shipPos.y, pl[k + 1] - shipPos.z);
                    if (dist < bd) { bd = dist; bi = pl[k + 3]; bx = pl[k]; by = pl[k + 2]; bz = pl[k + 1]; }
                }
            }
            for (let c = 0; c < covers.length; c++) {
                const cv = covers[c];
                for (let k = 0; k < cv.items.length; k++) {
                    const it = cv.items[k];
                    if (!it.on || alongOf(it.x, it.z) < -8) continue;
                    const dist = Math.hypot(it.x - shipPos.x, it.y - shipPos.y, it.z - shipPos.z);
                    if (dist < bd) { bd = dist; bi = cv.si; bx = it.x; by = it.y; bz = it.z; }
                }
            }
            return bi >= 0 ? { spec: floraList[bi], index: bi, distance: bd, dist: bd, position: new THREE.Vector3(bx, by, bz) } : null;
        }

        function stats() {
            let tris = 0;
            scene.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
                if (o.parent === skyGroup) return;
                const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
                tris += o.isInstancedMesh ? n * o.count : n;
            });
            return {
                chunks: chunks.size,
                geometries: geoCount.made - geoCount.freed,
                geometriesMade: geoCount.made,
                geometriesFreed: geoCount.freed,
                triangles: Math.round(tris),
                creatures: creatures.length + herds.reduce((n, hd) => n + hd.members.length, 0),
                leaders: creatures.length,
                followers: herds.reduce((n, hd) => n + hd.members.length, 0),
                plantSpecies: floraList.length,
                plants: Array.from(chunks.values()).reduce((n, ch) => n + (ch.plants ? ch.plants.length / 4 : 0), 0) + covers.reduce((n, cv) => n + cv.items.filter(it => it.on).length, 0),
                groundCover: covers.reduce((n, cv) => n + cv.items.length, 0),
                puffs: puffSets.reduce((n, s) => n + s.mesh.count, 0),
                distance: d,
                altitude: shipPos.y - ground(shipPos.x, shipPos.z),
                cityBuildings: cityBuilt
            };
        }

        function setQuality(qd) {
            if (!DETAIL[qd] || qd === detail) return;
            detail = qd; D = DETAIL[qd];
            scene.fog.near = D.far * fogK[0]; scene.fog.far = D.far * fogK[1];
            for (const ch of chunks.values()) dropChunk(ch);
            chunks.clear();
            stream(Infinity);
            buildWater();
            makeCreatures();
            makeCover();
            makePuffs();
        }

        let disposed = false;
        function dispose() {
            if (disposed) return;
            disposed = true;
            for (const ch of chunks.values()) dropChunk(ch);
            chunks.clear();
            if (water) { scene.remove(water); free(water.geometry); water = null; }
            clearCreatures();
            clearCover();
            puffSets.splice(0).forEach(s => s.dispose());
            solidPuffs.length = 0;
            saucers.forEach(s => scene.remove(s.g));
            launchers.forEach(l => scene.remove(l.g));
            if (trafficBody) { [trafficBody, trafficGlow].forEach(m => { scene.remove(m); free(m.geometry); if (m.dispose) m.dispose(); }); trafficBody = trafficGlow = null; }
            [carBody, carGlow, droneBody, droneLight].forEach(m => { if (m && m.dispose) m.dispose(); });
            owned.geos.forEach(free);
            owned.mats.forEach(m => m.dispose());
            scene.remove(ship);
            ship.visible = true;
            while (scene.children.length) scene.remove(scene.children[0]);
            scene.fog = null;
        }

        // ----- start ------------------------------------------------------------------------------
        yaw = wander(0);
        setFrame();
        shipPos.y = 0;
        predictLane();
        poseShip(0);
        stream(Infinity);
        buildWater();
        makeCreatures();
        makeCover();
        makePuffs();
        poseShip(0);

        const api = {
            scene: scene,
            type: type,
            style: style,
            update: update,
            setView: setView,
            /** The way in (k 0 high up .. 1 skimming) or out; rate = k per second (+ coming down). */
            setIntro: setIntro,
            steer: steer,
            heading: () => yaw,
            nearestCreature: nearestCreature,
            species: () => speciesList.slice(),
            plants: () => PLANTS,
            flora: () => floraList.slice(),
            nearestPlant: nearestPlant,
            /** The rare sights: true once each has been in view near the ship (stays true). */
            seen: () => ({ rainbow: seenRare.rainbow, golden: seenRare.golden, giant: seenRare.giant }),
            /** Civilisation info: architecture, spaceports passed, launches, traffic craft positions. */
            civ: () => civ ? {
                arch: ARCH, style: CSTYLE, tech: Object.keys(TECH).filter(k => TECH[k]),
                portsSeen: portsSeen.size, launches: launches, buildingsBuilt: cityBuilt,
                traffic: traffic.filter(c => c.city).map(c => ({ x: c.x, y: c.y, z: c.z })),
                built: { domes: domesBuilt, megas: megasBuilt, islands: islandsBuilt, beacons: beaconsBuilt, panels: panelsBuilt, rail: railBuilt, barns: barnsBuilt },
                seen: Object.assign({}, civSeen), elevator: !!civSky.tether, ring: !!civSky.ring
            } : null,
            setSpeed: k => { speedT = U.clamp(+k || 1, 0.5, 2); },
            setQuality: setQuality,
            heightAt: ground,
            /** Height of the ship above whatever is under it (ground, or a tree / spire / tower top). */
            clearance: () => shipPos.y - Math.max(ground(shipPos.x, shipPos.z), obstacleTop(shipPos.x, shipPos.z)),
            terrainAt: height,
            seaLevel: hasSea ? seaH : null,
            stats: stats,
            sky: { top: hexOf(skyTop), mid: hexOf(skyMid), horizon: hexOf(skyHor) },
            dispose: dispose
        };
        Object.defineProperty(api, 'bank', { get: () => bank });
        Object.defineProperty(api, 'pitch', { get: () => pitch });
        Object.defineProperty(api, 'position', { get: () => shipPos });
        return api;
    }

    return { create: create, DETAIL: DETAIL, VIEWS: VIEWS, STYLES: STYLES };
})();
