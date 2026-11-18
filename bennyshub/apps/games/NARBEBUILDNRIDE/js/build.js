/**
 * NARBE Build n Ride - building a track, as logic only (Build and Quick Build).
 *
 * Build: an endless world (BNR.World, procedural), a start station facing east
 * from the origin (three straights that never move) and the player's pieces
 * after it: Straight, Long Straight (three at once), Turn Left, Turn Right,
 * Undo and Connect. Crossing itself works (BNR.Track goes over), and the
 * start's approach stays clear (o.corridor) so Connect (BNR.Path) can always
 * close the loop.
 *
 * A press is refused (check(kind)) when it would go above two levels ('high'),
 * need a ramp steeper than a STEP ('steep'), leave less room to go on than
 * another press, looking six pieces ahead ('stuck'), or when the player's pieces
 * are used up ('full': MAX_PIECES presses; Undo gives one back, Connect is free).
 * Undo and Connect always work. Track goes anywhere: buildings, trees and rocks make way for it
 * (clearedBy says which buildings a press cleared, for a puff of dust).
 *
 * Stations appear by themselves, one per zone, the first time the track lays a
 * run of three level straights there (on open ground, beside a free cell for
 * the station house, not too near another station, and only where the track
 * keeps its room to go on). Their pieces never tilt. Anything that crosses a
 * station later goes high over it (extraNeed), clear of the canopy and house.
 *
 * Quick Build: a route's own loop, laid a piece of the design per press (3 to 5
 * track sections). It starts with the track already laid up to its first
 * station, where the train waits; the ground is ready for the whole route
 * (fullTrack, allSites) from the start, so nothing there ever makes way.
 *
 *   const s = BNR.Build.create({ seed, detail })  (Build; detail: the graphics level's share of buildings)
 *   const q = BNR.Build.quick('countryside')      (Quick Build; q.presses pieces, q.pressed() down)
 *   s.check(kind) -> { ok } | { ok: false, why }; s.blocked() -> each button's why; s.piecesLeft()
 *   s.add('S' | 'LS' | 'L' | 'R') -> { placed, closes, kinds, newSites } (or { placed: [], blocked: why })
 *   s.undo() / s.preview(type) / s.planHome() / s.connectSteps() (a generator)
 *   BNR.Build.clearedBy(s, result) -> the buildings that press cleared away
 *   q.next() -> lays the next piece of the design
 *   s.record()  -> a plain object for My Tracks; BNR.Build.restore(record) -> a closed session
 *   BNR.Build.eventsFor(track, world, sites) -> things to see on a home-made loop
 * Runs in Node (tests/build.test.cjs).
 */

window.BNR = window.BNR || {};

BNR.Build = (function () {
    'use strict';

    const START = { cx: 0, cz: 0, h: 1 };     // the start station runs east from the origin
    const PIECES = {
        S: { types: ['S'], name: 'Straight' },
        LS: { types: ['S', 'S', 'S'], name: 'Long Straight' },
        L: { types: ['L'], name: 'Turn Left' },
        R: { types: ['R'], name: 'Turn Right' }
    };
    const MIN_GAP = 110;                      // stations at least this far apart
    // The pieces a player may lay in Build: one a press (a Long Straight is one piece), Undo gives
    // one back, and Connect's way home is free. A plain count down, the same for every button.
    // Only the track and land near the camera are built (js/trackview.js, js/terrain.js), so a
    // ride costs the same however long the loop; the biggest possible (every piece a Long
    // Straight, straight out, then Connect home: about 3000 sections, a 78-minute lap) rides in
    // 43 MB, a press there takes about 45 ms and Connect is laid in about 10 seconds.
    const MAX_PIECES = 500;
    const LOOK = 6;                           // how many pieces ahead a press is checked for a way on
    // A saved track keeps its presses as one letter each, so it can be built again press by press
    // (Keep Building, Edit), with Undo going back a press at a time just as before.
    const CODE = { S: 'S', LS: 'T', L: 'L', R: 'R' };
    const KIND = { S: 'S', T: 'LS', L: 'L', R: 'R' };

    function T() { return BNR.Track; }

    /** Right of travel for heading h (side 1) or left (side -1), as a cell step. */
    function sideStep(h, side) { const d = T().DIRS[h]; return [-d[1] * side, d[0] * side]; }
    function dirIndex(dx, dz) { return T().DIRS.findIndex(d => d[0] === dx && d[1] === dz); }

    /** The graphics detail a session's buildings are seen at (o.detail: a number or a function). */
    function detailOf(o) { const d = typeof o.detail === 'function' ? o.detail() : o.detail; return d === undefined || d === null ? 1 : d; }

    /** Does a building stand on a station's ground (its platform and house on `side` of piece h's middle m)? */
    function onStationGround(b, m, h, side) {
        const d = T().DIRS[h], rx = -d[1] * side, rz = d[0] * side;
        const dx = b.x - m.x, dz = b.z - m.z;
        const a = dx * d[0] + dz * d[1], w = dx * rx + dz * rz;
        // The platform's length and a little (23.5 each way), from the track's edge out past the
        // house (1.55 to 10.6; js/stations.js pads): scenery there makes way.
        return Math.hypot(Math.max(Math.abs(a) - 23.5, 0), Math.max(1.55 - w, w - 10.6, 0)) < 2;
    }

    /**
     * Free Build lets track go anywhere: the world's buildings in its way make way (the terrain
     * leaves out any within 3.4 past its size of track, or on a station's ground). Which of them
     * did this press clear? (For a puff of dust where each one stood.)
     */
    function clearedBy(s, res, detail) {
        const t = s.track, world = s.world;
        const placed = (res && res.placed) || [], fresh = (res && res.newSites) || [];
        if ((!placed.length && !fresh.length) || !world || !world.buildingsIn) return [];
        const c = t.centerline();
        // The new pieces' samples (none for stations found once Connect is done).
        const a = placed.length ? c.startIndex[placed[0].i] : 0;
        const b = !placed.length ? 0 : placed[placed.length - 1].i + 1 < c.startIndex.length ? c.startIndex[placed[placed.length - 1].i + 1] : c.n;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        const grow = function (x, z) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
        for (let i = a; i < b; i++) grow(c.x[i], c.z[i]);
        fresh.forEach(function (site) { const q = BNR.Track.piecePoint(t.pieces[site.piece], 0.5); grow(q.x - 20, q.z - 20); grow(q.x + 20, q.z + 20); });
        // Deep in a tunnel the track leaves the town on the hill above it alone.
        const touches = function (bd, from, to) {
            for (let i = from; i < to; i++) {
                if (c.struct[i] === 'tunnel' && c.ground[i] - c.y[i] >= 12) continue;
                if (Math.hypot(c.x[i] - bd.x, c.z[i] - bd.z) < 3.4 + bd.radius) return true;
            }
            return false;
        };
        const stationOn = function (bd, list) {
            return list.some(function (site) {
                const p = t.pieces[site.piece];
                return p && onStationGround(bd, BNR.Track.piecePoint(p, 0.5), p.h, site.side);
            });
        };
        const old = s.sites.filter(x => fresh.indexOf(x) < 0);
        return world.buildingsIn(x0 - 30, z0 - 30, x1 + 30, z1 + 30, detail).filter(function (bd) {
            if (!touches(bd, a, b) && !stationOn(bd, fresh)) return false;               // this press leaves it be
            // Not cleared already (the first new sample is where the track ended before: old track too).
            return !touches(bd, 0, Math.min(c.n, a + 1)) && !touches(bd, b, c.n) && !stationOn(bd, old);
        });
    }

    /**
     * The shared machinery: a track, its stations and what crossing a station costs.
     * o: { world, start, locked, corridor, protect (Build: stations), detail }
     */
    function base(o) {
        const runCells = new Map();      // 'cx,cz' -> site: the station's own track
        const houseCells = new Map();    // 'cx,cz' -> port facing the station (the house's cell)
        const held = new Set();          // the stations' pieces: no ramp ever tilts them
        const sites = [];
        const extraNeed = function (cx, cz, h, type) {
            const k = cx + ',' + cz;
            if (runCells.has(k)) return T().LEVEL + T().STEP;
            const port = houseCells.get(k);
            if (port !== undefined) {
                const inPort = (h + 2) % 4, outPort = (h + T().TYPES[type].turn + 4) % 4;
                if (inPort === port || outPort === port) return T().LEVEL + T().STEP;
            }
            return 0;
        };
        const track = T().create({
            world: o.world, start: o.start, locked: o.locked || 0, corridor: !!o.corridor,
            extraNeed: o.protect ? extraNeed : null, fixed: o.protect ? (i => held.has(i)) : null
        });

        function register(site) {
            site.refs.forEach(p => runCells.set(p.cx + ',' + p.cz, site));
            site.refs.forEach(p => held.add(p.i));
            if (site.house) houseCells.set(site.house.key, site.house.port);
        }
        function reindex() {
            runCells.clear(); houseCells.clear(); held.clear();
            sites.forEach(register);
        }
        /** Stations whose pieces are gone (undone) go too. */
        function dropLost() {
            const lost = [];
            for (let i = sites.length - 1; i >= 0; i--) {
                const s = sites[i];
                if (!s.refs.every(p => track.pieces[p.i] === p)) lost.push(sites.splice(i, 1)[0]);
            }
            if (lost.length) reindex();
            return lost;
        }
        return { track: track, sites: sites, held: held, register: register, reindex: reindex, dropLost: dropLost, detail: () => detailOf(o) };
    }

    /** What the new pieces turned into: tunnel, bridge or overpass (for a word as they go down). */
    function kindsOf(track, placed) {
        const out = [];
        if (!placed.length) return out;
        const c = track.centerline();
        const first = placed[0].i, last = placed[placed.length - 1].i;
        const a = c.startIndex[first], b = last + 1 < c.startIndex.length ? c.startIndex[last + 1] : c.n;
        const before = a > 0 ? c.struct[a - 1] : null;
        let tunnel = false, bridge = false;
        for (let i = a; i < b; i++) {
            if (c.struct[i] === 'tunnel' && before !== 'tunnel') tunnel = true;
            if (c.struct[i] === 'bridge' && c.lift[i] <= 0.6 && before !== 'bridge') bridge = true;
        }
        // Over the top: a new piece a level or more above track already in its cell.
        const over = placed.some(function (p) {
            const lo = Math.min(track.liftIn(p.i), track.liftOut(p.i));
            return track.cellPieces(p.cx, p.cz).some(j => j !== p.i && Math.max(track.liftIn(j), track.liftOut(j)) <= lo - T().LEVEL + 1e-6);
        });
        if (tunnel) out.push('tunnel');
        if (over) out.push('overpass');
        else if (bridge) out.push('bridge');
        return out;
    }

    /** A station's place on the track from a run of three straights (or null if it can't go there). */
    function siteFor(track, world, sites, run, usedNames) {
        const refs = run.map(i => track.pieces[i]);
        const mid = refs[1];
        const m = BNR.Track.piecePoint(mid, 0.5);
        if (sites.some(s => Math.hypot(s.x - m.x, s.z - m.z) < MIN_GAP)) return null;
        const zone = world.zoneAt(m.x, m.z);
        const datum = track.datumAt(m.x, m.z);
        let best = null;
        [1, -1].forEach(function (side) {
            const st = sideStep(mid.h, side);
            const hx = mid.cx + st[0], hz = mid.cz + st[1];
            if (track.cellPieces(hx, hz).length || track.corridorK(hx, hz)) return;
            const q = world.sample(m.x + st[0] * 8, m.z + st[1] * 8);
            if (q.wet) return;
            const score = Math.abs(q.h - datum);
            if (!best || score < best.score) best = { side: side, score: score, house: { key: hx + ',' + hz, port: dirIndex(-st[0], -st[1]) } };
        });
        if (!best) return null;
        // A name of its own: the region's pick, or the next unused one from its landscape's list.
        const names = BNR.Biomes.get(zone.biome).stationNames || [zone.name];
        let name = zone.name;
        if (usedNames.has(name)) name = names.find(n => !usedNames.has(n)) || null;
        if (!name) { let k = 2; while (usedNames.has(zone.name + ' ' + k)) k++; name = zone.name + ' ' + k; }
        return {
            zone: zone.key, name: name, biome: zone.biome, piece: mid.i, pieces: run.slice(), at: 0.5, side: best.side,
            house: best.house, refs: refs, x: m.x, z: m.z
        };
    }

    /** A piece that can carry a platform: a level straight at ground level, alone in its cell. */
    function platformPiece(track, c, p) {
        if (p.type !== 'S' || track.liftIn(p.i) !== 0 || track.liftOut(p.i) !== 0) return false;
        if (track.cellPieces(p.cx, p.cz).length !== 1 || track.corridorK(p.cx, p.cz)) return false;
        const a = c.startIndex[p.i];
        for (let k = 0; k < 14; k++) if (c.struct[a + k] && c.struct[a + k] !== 'ground') return false;
        return true;
    }

    // --- Build ------------------------------------------------------------------------------------

    function create(o) {
        o = o || {};
        const seed = (o.seed | 0) || (1 + Math.floor(Math.random() * 2e9));
        const world = o.world || BNR.World.create({ seed: seed, procedural: true });
        const B = base({ world: world, start: START, locked: 3, corridor: true, protect: true, detail: o.detail });
        const track = B.track, sites = B.sites;

        /** The start station: three straights that never move, and its platform. */
        function startStation() {
            track.add(['S', 'S', 'S'], { station: true });
            const run = [0, 1, 2];
            const s = siteFor(track, world, [], run, new Set());
            const fallback = { zone: world.zoneAt(21, 7).key, name: world.zoneAt(21, 7).name, biome: world.zoneAt(21, 7).biome, piece: 1, pieces: run, at: 0.5, side: 1, house: { key: '1,1', port: 0 }, refs: run.map(i => track.pieces[i]), x: 21, z: 7 };
            const site = s || fallback;
            site.start = true;
            sites.push(site);
            B.register(site);
        }
        if (o.restore) {
            track.restore(o.restore.types, o.restore.lifts);
            (o.restore.sites || []).forEach(function (r) {
                const run = r.pieces || [r.piece - 1, r.piece, r.piece + 1];
                const refs = run.map(i => track.pieces[i]).filter(Boolean);
                if (refs.length !== run.length) return;
                const mid = track.pieces[r.piece], m = BNR.Track.piecePoint(mid, 0.5);
                const st = sideStep(mid.h, r.side);
                const site = { zone: r.zone, name: r.name, biome: r.biome, piece: r.piece, pieces: run, at: 0.5, side: r.side,
                    house: { key: (mid.cx + st[0]) + ',' + (mid.cz + st[1]), port: dirIndex(-st[0], -st[1]) }, refs: refs, x: m.x, z: m.z, start: !!r.start };
                sites.push(site);
                B.register(site);
            });
        } else {
            startStation();
            // A saved track (unfinished, or a finished one opened to edit): its presses again, in
            // order, by the same rules, so it comes back exactly as it was built, Undo and all.
            if (o.presses) {
                for (const ch of String(o.presses)) {
                    const kind = KIND[ch];
                    if (!kind || track.closed()) continue;
                    track.add(typesOf(kind), { kind: kind });
                    B.dropLost();
                    findSites();
                }
                // To build on, the loop must be open: a loop the player's own last press closed
                // opens again where that press went down.
                if (o.open && track.closed()) { track.undo(); B.dropLost(); }
            }
        }

        /** The most room ahead (pieces, up to LOOK) any single piece from the end has; -1 if none can go. */
        function bestReach() {
            let best = -1;
            ['S', 'L', 'R'].forEach(function (t) { const pv = track.preview(t, { look: LOOK }); if (pv.ok) best = Math.max(best, pv.reach); });
            return best;
        }
        /**
         * A station's pieces never tilt, so a ramp after it can't reach back into it: make one
         * only where that leaves the track as much room to go on as it has now.
         */
        function roomAfter(run) {
            if (track.closed() || run[run.length - 1] < track.pieces.length - 1 - T().MAXBACK) return true;
            const now = bestReach();
            run.forEach(i => B.held.add(i));
            const then = bestReach();
            run.forEach(i => B.held.delete(i));
            return then >= now;
        }

        /** New stations: zones without one that now have a run of three platform pieces. */
        function findSites() {
            const c = track.centerline();
            const have = new Set(sites.map(s => s.zone));
            const used = new Set(sites.map(s => s.name));
            const found = [];
            let run = [];
            for (let i = 3; i < track.pieces.length; i++) {
                const p = track.pieces[i];
                if (!platformPiece(track, c, p)) { run = []; continue; }
                if (run.length && (run[run.length - 1] !== i - 1 || track.pieces[run[0]].h !== p.h)) run = [];
                run.push(i);
                if (run.length < 3) continue;
                const r3 = run.slice(-3);
                const mid = BNR.Track.piecePoint(track.pieces[r3[1]], 0.5);
                const zone = world.zoneAt(mid.x, mid.z);
                if (have.has(zone.key)) continue;
                const s = siteFor(track, world, sites, r3, used);
                if (!s || !roomAfter(r3)) continue;
                sites.push(s);
                B.register(s);
                have.add(s.zone);
                used.add(s.name);
                found.push(s);
                run = [];
            }
            return found;
        }

        /** o.connecting: no new stations yet (Connect's ramps may still need those straights). */
        function after(placed, o) {
            const lost = B.dropLost();
            const newSites = o && o.connecting ? [] : findSites();
            return { placed: placed, closes: track.closed(), kinds: kindsOf(track, placed), newSites: newSites, lostSites: lost };
        }

        let checked = { version: -1, list: {} };
        const cap = o.maxPieces || MAX_PIECES;     // o.maxPieces: tests and measurements only
        /** The player's presses on the track now (not the start station, not Connect's pieces). */
        function presses() { return track.countGroups(m => !!(m && m.kind)); }
        function typesOf(kind) { const def = PIECES[kind]; return def.types.length === 1 ? def.types[0] : def.types.slice(); }

        const api = {
            mode: 'build',
            seed: seed,
            world: world,
            track: track,
            sites: sites,
            start: START,
            PIECES: PIECES,
            /** The share of the world's buildings standing at this graphics level (for clearedBy). */
            detail: B.detail,
            closed: function () { return track.closed(); },
            /**
             * Can this press go down? { ok } or { ok: false, why }: 'full' (no track left to get
             * that far from home: Connect), 'building' (one of the world's buildings is in the
             * way: track goes between them), 'high' (above the ceiling, two levels), 'steep' (no
             * room behind it for a ramp) or 'stuck' (another piece leaves more room to go on).
             */
            check: function (kind) {
                if (!PIECES[kind]) throw new Error('Unknown piece ' + kind);
                if (track.closed()) return { ok: false, why: 'closed' };
                if (checked.version !== track.version()) {
                    // Every button at once: a press may only be 'stuck' when another leaves more room.
                    // Looking six pieces on, a corkscrew stops a turn early, while the track can
                    // still get out; and a press is never refused just for looking ahead.
                    const out = {};
                    let best = -1;
                    Object.keys(PIECES).forEach(function (k) {
                        const pv = track.preview(typesOf(k), { look: LOOK });
                        let why = null;
                        if (presses() >= cap) why = 'full';
                        else if (pv.top > T().MAX_LIFT + 1e-6) why = 'high';
                        else if (pv.steep) why = 'steep';
                        out[k] = { why: why, reach: pv.reach };
                        if (!why) best = Math.max(best, pv.reach);
                    });
                    Object.keys(out).forEach(function (k) {
                        const r = out[k];
                        out[k] = r.why ? { ok: false, why: r.why } : r.reach < best ? { ok: false, why: 'stuck' } : { ok: true };
                    });
                    checked = { version: track.version(), list: out };
                }
                return checked.list[kind];
            },
            /** Each piece button's reason it can't go down now (null when it can). */
            blocked: function () {
                const out = {};
                Object.keys(PIECES).forEach(function (k) { const c = api.check(k); out[k] = c.ok ? null : c.why; });
                return out;
            },
            /** How many more pieces the player may lay (Connect's way home is free). */
            piecesLeft: function () { return track.closed() ? 0 : Math.max(0, cap - presses()); },
            /** How many the player may lay in all. */
            pieceLimit: cap,
            /**
             * Lay a piece: 'S' straight, 'LS' long straight (three), 'L' left, 'R' right. A press
             * that can't go down (check) lays nothing: { placed: [], blocked: why }.
             */
            add: function (kind) {
                if (track.closed()) return null;
                const def = PIECES[kind];
                if (!def) throw new Error('Unknown piece ' + kind);
                const c = api.check(kind);
                if (!c.ok) return { placed: [], blocked: c.why, closes: false, kinds: [], newSites: [], lostSites: [] };
                return after(track.add(typesOf(kind), { kind: kind }));
            },
            canUndo: function () { return track.groupCount() > 1 && !track.closed(); },
            /** Take back the last press (never the start station). */
            undo: function () {
                if (!api.canUndo()) return null;
                const removed = track.undo();
                const lost = B.dropLost();
                return { removed: removed, lostSites: lost };
            },
            /** The pieces the last press laid (shown when Undo is highlighted). */
            lastGroup: function () {
                if (track.groupCount() <= 1) return [];
                const g = track.pieces.length ? track.pieces[track.pieces.length - 1].group : 0;
                return track.pieces.filter(p => p.group === g).map(p => Object.assign({}, p, { liftIn: track.liftIn(p.i), liftOut: track.liftOut(p.i) }));
            },
            /** What a press would lay, without laying it: pieces with their lifts. */
            preview: function (kind) {
                const def = PIECES[kind];
                if (!def || track.closed()) return { pieces: [], closes: false };
                return track.preview(def.types.length === 1 ? def.types[0] : def.types.slice());
            },
            /** The way home Connect would take now (for its preview). */
            planHome: function () { return track.closed() ? [] : (BNR.Path.connect(track) || []); },
            /** The way home as pieces with their lifts (Connect's gold preview). */
            planPieces: function () {
                if (track.closed()) return [];
                const types = BNR.Path.connect(track, { quick: true });
                return types && types.length ? track.preview(types).pieces : [];
            },
            /**
             * Connect, one change at a time: yields { op: 'add', placed, kinds, newSites } or
             * { op: 'undo', lostSites }. Always ends with the loop closed.
             */
            connectSteps: function* () {
                const it = BNR.Path.closeSteps(track);
                // Where every piece is, so an undo can say where track was taken away.
                const mids = track.pieces.map(p => BNR.Track.piecePoint(p, 0.5));
                for (let r = it.next(); !r.done; r = it.next()) {
                    if (r.value.op === 'add') {
                        r.value.placed.forEach(p => { mids[p.i] = BNR.Track.piecePoint(p, 0.5); });
                        yield Object.assign({ op: 'add', left: r.value.left }, after(r.value.placed, { connecting: true }));
                    } else {
                        const removed = mids.splice(track.pieces.length);
                        yield { op: 'undo', lostSites: B.dropLost(), removed: removed };
                    }
                }
                // A late station check on the closed loop (its last straights may make one).
                const late = findSites();
                if (late.length) yield { op: 'sites', newSites: late };
            },
            record: function () { return record(api); },
            /** A restored loop keeps the lift unit it was saved with (an old save's, scaled). */
            liftUnit: o.restore ? o.restore.unit : null,
            /** Pieces laid by the player: one a press (a Long Straight is one piece); Connect's are free. */
            pieceCount: function () { return presses(); },
            /** Track sections past the start station (a Long Straight is three). */
            sections: function () { return Math.max(0, track.pieces.length - 3); }
        };
        return api;
    }

    // --- Quick Build ---------------------------------------------------------------------------------

    /**
     * How Quick Build lays a route: the track down from the start (to its first station, where
     * the train waits), then what each Build press lays: a piece of the design, 3 to 5 track
     * sections long, a little random but the same every time for a route.
     */
    function quickPlan(full, allSites) {
        const types = BNR.Track.fromCorners(full.route.corners).types;
        const first = Math.min(types.length, allSites.length ? Math.max.apply(null, allSites[0].pieces) + 2 : 4);
        const rnd = BNR.Util.mulberry(full.world.seed ^ 0x51ce);
        const sizes = [];
        for (let at = first; at < types.length;) { const n = Math.min(types.length - at, 3 + Math.floor(rnd() * 3)); sizes.push(n); at += n; }
        return { types: types, first: first, sizes: sizes };
    }

    /**
     * What a design's tile says: how many pieces (Build presses) it takes, and its stations.
     * Worked out once each; quickFacts(id, true) only reads what is ready (the menu never waits).
     */
    const quickCache = {};
    function quickFacts(id, readyOnly) {
        if (quickCache[id] || readyOnly) return quickCache[id] || null;
        const full = BNR.Routes.build(id);
        const allSites = full.track.stationSites();
        const plan = quickPlan(full, allSites);
        quickCache[id] = { presses: plan.sizes.length, stations: allSites.length, sections: plan.types.length };
        return quickCache[id];
    }

    /**
     * A route laid a piece at a time (one piece a Build press, each a stretch of 3 to 5 track
     * sections). The sections are exactly the Ride's (same order, so the same overpasses); the
     * stations are the Ride's too, each showing once its platform is laid.
     */
    function quick(routeId, o) {
        o = o || {};
        const full = BNR.Routes.build(routeId);
        const route = full.route;
        const plan = BNR.Track.fromCorners(route.corners);
        const allSites = full.track.stationSites();
        const B = base({ world: full.world, start: plan.start });
        const track = B.track, sites = B.sites;
        const types = plan.types;
        const qp = quickPlan(full, allSites);
        // The scenery reaches as far as the finished loop's (as a Ride's does).
        const fc = full.track.centerline();
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < fc.n; i++) { x0 = Math.min(x0, fc.x[i]); x1 = Math.max(x1, fc.x[i]); z0 = Math.min(z0, fc.z[i]); z1 = Math.max(z1, fc.z[i]); }
        track.add(types.slice(0, qp.first), { start: true });
        let at = track.pieces.length;
        // Each press's stretch is known ahead, so the preview shows exactly what the next press lays.
        let pressed = 0;
        function chunk() { return qp.sizes[pressed] || 0; }
        function reveal() {
            const out = [];
            allSites.forEach(function (s) {
                if (s.shown || Math.max.apply(null, s.pieces) >= track.pieces.length) return;
                s.shown = true;
                const refs = s.pieces.map(i => track.pieces[i]);
                const m = BNR.Track.piecePoint(track.pieces[s.piece], s.at);
                const site = Object.assign({}, s, { refs: refs, x: m.x, z: m.z });
                sites.push(site);
                out.push(site);
            });
            return out;
        }
        reveal().forEach(s => { s.start = true; });
        return {
            mode: 'quick',
            routeId: routeId,
            route: route,
            world: full.world,
            track: track,
            lines: full.lines,
            sites: sites,
            // The whole loop and all its stations: the ground is made ready for them from the start,
            // so scenery and buildings stand clear of the route and never vanish as track goes down.
            fullTrack: full.track,
            allSites: allSites,
            bounds: [x0 - 300, z0 - 300, x1 + 300, z1 + 300],
            closed: function () { return track.closed(); },
            /** The design's pieces: one a Build press (what its tile says). */
            presses: qp.sizes.length,
            /** How many of them are down. */
            pressed: function () { return pressed; },
            /** 0..1: how much of the loop is down. */
            progress: function () { return track.pieces.length / types.length; },
            /** What the next Build press will lay (its see-through preview). */
            peek: function () {
                if (track.closed() || at >= types.length) return [];
                return track.preview(types.slice(at, at + chunk())).pieces;
            },
            /** Lay the next piece of the design (3 to 5 track sections). */
            next: function () {
                if (track.closed() || at >= types.length) return null;
                const n = chunk();
                pressed++;
                const placed = track.add(types.slice(at, at + n), { quick: true });
                at += placed.length;
                return { placed: placed, closes: track.closed(), kinds: kindsOf(track, placed), newSites: reveal(), lostSites: [] };
            },
            canUndo: function () { return false; },
            record: function () { return null; }
        };
    }

    // --- saving -----------------------------------------------------------------------------------------

    /**
     * A plain, small object for My Tracks: the world's seed, the pieces, every joint's lift (in
     * steps of `unit`), the stations. v1 (before the taller overpasses) had no unit: steps of 2.5
     * under 5-unit levels; those come back scaled up to today's level height, shape unchanged.
     */
    function record(session) {
        const t = session.track, unit = session.liftUnit || T().STEP;
        // The player's presses, in order (not Connect's pieces): for Keep Building and Edit.
        const metas = t.groupMetas ? t.groupMetas() : [];
        return {
            v: 3,
            finished: t.closed(),
            presses: metas.filter(m => m && m.kind && CODE[m.kind]).map(m => CODE[m.kind]).join(''),
            seed: session.seed,
            start: Object.assign({}, session.start || START),
            types: t.types(),
            unit: unit,
            lifts: t.lifts().map(l => Math.round(l / unit)),
            sites: session.sites.map(s => ({ zone: s.zone, name: s.name, biome: s.biome, piece: s.piece, pieces: s.pieces.slice(), side: s.side, start: !!s.start })),
            stations: session.sites.length,
            length: Math.round(t.centerline().length)
        };
    }

    /**
     * A saved track opened to build on: built again press by press (an unfinished one as it was
     * left; a finished one up to where Connect took over). A loop saved before presses were kept
     * comes back as every piece after the start but the last. o: { detail }.
     */
    function resume(rec, o) {
        const presses = typeof rec.presses === 'string' ? rec.presses : String(rec.types || '').slice(3, -1);
        return create(Object.assign({ seed: rec.seed, presses: presses, open: true }, o || {}));
    }

    /** A saved track, back as a (closed) Build session. */
    function restore(rec) {
        const unit = rec.unit || 2.5 * (T().LEVEL / 5);
        return create({ seed: rec.seed, restore: { types: rec.types, lifts: rec.lifts.map(l => l * unit), sites: rec.sites, unit: unit } });
    }

    // --- things to see on a home-made loop ------------------------------------------------------------

    const SIGHTS = {
        meadow: ['sheep', 'balloons', 'deer', 'birds'],
        farm: ['tractor', 'sheep', 'balloons', 'birds'],
        forest: ['deer', 'birds', 'eagle'],
        lake: ['birds', 'balloons', 'deer'],
        mountains: ['eagle', 'balloons', 'birds'],
        alpine: ['sheep', 'eagle', 'balloons'],
        desert: ['tumbleweed', 'eagle', 'balloons'],
        dunes: ['tumbleweed', 'balloons', 'eagle'],
        redrock: ['eagle', 'tumbleweed', 'balloons'],
        oasis: ['birds', 'balloons', 'tumbleweed'],
        snowfield: ['deer', 'birds', 'balloons'],
        snowforest: ['deer', 'birds', 'eagle'],
        snowvillage: ['birds', 'balloons', 'deer'],
        town: ['birds', 'balloons', 'sheep'],
        city: ['blimp', 'birds', 'balloons'],
        coast: ['gulls', 'sheep', 'balloons']
    };

    /**
     * Events for a closed home-made loop, spread round it (about one every 260 units), each
     * suited to the land it is in. A station stop never falls between an event's start and
     * its anchor (it would play while the train stands round a corner). Night and winter
     * extras (fireworks, northern lights) where the land suits them.
     */
    function eventsFor(track, world, sites) {
        const c = track.centerline();
        if (!c.closed) return [];
        const L = c.length;
        const leadOf = type => { const K = BNR.Events && BNR.Events.info(type); return K && K.lead !== undefined ? K.lead : 100; };
        const stops = (sites || []).map(s => c.s[c.startIndex[s.piece]] + track.pieces[s.piece].len * (s.at || 0.5));
        const sAt = i => c.s[c.startIndex[i]] + track.pieces[i].len / 2;
        const clearOfStops = function (sAnchor, lead) {
            return stops.every(function (st) {
                let d = sAnchor - st;
                d = ((d % L) + L) % L;            // how far the anchor is past the stop
                return d > lead + 30 && L - d > 40;
            });
        };
        const n = Math.max(2, Math.min(12, Math.round(L / 260)));
        const out = [];
        const used = {};
        const rnd = BNR.Util.mulberry((track.pieces.length * 7919) ^ 0x2f);
        for (let k = 0; k < n; k++) {
            // Aim for an even spread, then slide forward to a spot clear of station stops.
            let piece = Math.floor((k + 0.5) / n * track.pieces.length);
            let tries = 0, def = null;
            while (tries++ < track.pieces.length) {
                const p = track.pieces[piece];
                const m = BNR.Track.piecePoint(p, 0.5);
                const biome = world.zoneAt(m.x, m.z).biome;
                const list = SIGHTS[biome] || SIGHTS.meadow;
                let type = list[Math.floor(rnd() * list.length)];
                if ((used[type] || 0) >= 2) type = list.find(t => (used[t] || 0) < 2) || type;
                const real = type === 'gulls' ? 'birds' : type;
                const lead = leadOf(real);
                if (clearOfStops(sAt(piece), lead)) {
                    def = { type: real, piece: piece, side: rnd() < 0.5 ? 1 : -1 };
                    if (type === 'gulls') def.kind = 'gull';
                    if (real === 'balloons') def.lead = 130;
                    used[type] = (used[type] || 0) + 1;
                    break;
                }
                piece = (piece + 1) % track.pieces.length;
            }
            if (def && !out.some(e => Math.abs(e.piece - def.piece) < 4)) out.push(def);
        }
        // Night and winter extras where the land suits them.
        const biomes = new Set();
        for (let i = 0; i < track.pieces.length; i += 4) { const m = BNR.Track.piecePoint(track.pieces[i], 0.5); biomes.add(world.zoneAt(m.x, m.z).biome); }
        const extra = function (type, when, near) {
            for (let tries = 0; tries < track.pieces.length; tries++) {
                const piece = (Math.floor(track.pieces.length * near) + tries * 3) % track.pieces.length;
                if (clearOfStops(sAt(piece), leadOf(type)) && !out.some(e => Math.abs(e.piece - piece) < 4)) { out.push({ type: type, piece: piece, side: 1, when: when }); return; }
            }
        };
        if (biomes.has('town') || biomes.has('city') || biomes.has('snowvillage')) extra('fireworks', { night: true }, 0.62);
        if ([...biomes].some(b => /snow|alpine|mountains/.test(b))) extra('aurora', { night: true, season: 'winter' }, 0.3);
        return out.sort((a, b) => a.piece - b.piece);
    }

    return {
        create: create,
        quick: quick,
        restore: restore,
        resume: resume,
        record: record,
        eventsFor: eventsFor,
        kindsOf: kindsOf,
        quickFacts: quickFacts,
        clearedBy: function (s, res) { return clearedBy(s, res, s.detail ? s.detail() : 1); },
        PIECES: PIECES,
        START: START,
        MAX_PIECES: MAX_PIECES
    };
})();
