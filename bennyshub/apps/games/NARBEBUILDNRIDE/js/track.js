/**
 * NARBE Build n Ride - the grid track.
 *
 * The track is laid on a grid of TILE x TILE cells, one piece per cell, and
 * every piece is RELATIVE to the way the train is already heading:
 *   S  straight on         (TILE long)
 *   L  a 90 degree curve to the left   (a quarter circle of radius TILE / 2)
 *   R  a 90 degree curve to the right
 * so the player never chooses a compass direction.
 *
 * Height: each joint between pieces sits at world.datum(joint) + lift. The
 * datum is smooth and gently sloped, so loops always close level. Lift is
 * for crossings: a piece that enters a cell already holding track that it
 * would touch goes OVER it, one LEVEL (6.75 units: the train, 4.7 tall, fits
 * under a girder 1.3 deep) higher, and the joints just behind it are raised
 * so the track ramps up to meet it (at most STEP, a third of a level, per
 * piece; never a piece with track above it, never the locked start). After
 * the crossing the track eases back down a STEP per piece.
 *
 * Nothing goes higher than MAX_LIFT (two levels: a crossing over a crossing).
 * The track itself lays whatever it is given; Build (js/build.js) refuses a
 * press that would go above MAX_LIFT, need a ramp steeper than a STEP, or
 * leave less room to go on than another press (preview(types, { look: n })
 * reports ok and reach), so a corkscrew of turns climbs about one and a half
 * loops and then heads out.
 *
 * Two pieces in one cell touch when they share an edge port (N/E/S/W) or are
 * both straights (they cross in the middle). Curves round opposite corners of
 * a cell never touch, so they need no bridge.
 *
 * The way back in (o.corridor, Build mode): the CORR cells straight behind
 * the start are the approach a closing loop arrives along. Track that CROSSES
 * them stays high (a level, plus a STEP for each cell further out, up to
 * CORR_BAND steps), and track coming in along them may pass underneath such a
 * crossing, so there is always room to come home at ground level: Connect can
 * always close a loop.
 *
 *   const t = BNR.Track.create({ world, start: { cx, cz, h }, locked: 3 });
 *   t.add('S') / t.add(['S','S','S'])   one undo group; returns the new pieces
 *   t.preview(['L'])                     what add() would do, without doing it (o.look: and after it)
 *   t.undo()                             removes the last group (and its ramps)
 *   t.end()                              { cx, cz, h, lift }: where the next piece goes
 *   t.closed()                           back at the start, level, same heading
 *   t.centerline()                       dense samples for rails, train and terrain
 *   t.restore(types, lifts)              put back a saved track exactly (My Tracks)
 * Runs in Node (no three.js).
 */

window.BNR = window.BNR || {};

BNR.Track = (function () {
    'use strict';

    const U = BNR.Util;
    const TILE = BNR.World.TILE;
    const STEP = 2.25;          // the most one piece climbs or falls (a ramp)
    const LEVEL = 3 * STEP;     // 6.75: one overpass level (train 4.72 tall + girder 1.3 deep + room)
    const MAX_LIFT = 2 * LEVEL; // the highest track goes: a crossing over a crossing
    const MAXBACK = 6;          // how many pieces behind a crossing may be raised into a ramp (two levels)
    const CORR_BAND = 3;        // a piece coming home along the approach is at most this many STEPs up
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N E S W as [dx, dz]
    const NAMES = ['north', 'east', 'south', 'west'];
    const TYPES = {
        S: { turn: 0, len: TILE, name: 'Straight' },
        L: { turn: -1, len: Math.PI * TILE / 4, name: 'Left' },
        R: { turn: 1, len: Math.PI * TILE / 4, name: 'Right' }
    };
    const CORR = 6;             // cells behind the start kept as the way back in (o.corridor)
    const TUNNEL_D = 5.4;       // ground this far above the rails: tunnel
    const BRIDGE_H = 3.0;       // ground this far below the rails: bridge
    const SPACING = 1;          // centre-line sample spacing (about)

    function key(cx, cz) { return cx + ',' + cz; }
    function cellCenter(cx, cz) { return [(cx + 0.5) * TILE, (cz + 0.5) * TILE]; }

    /** How high a piece coming home may be in approach cell k (it comes down a STEP a cell). */
    function corridorBand(k) { return Math.min(k - 1, CORR_BAND) * STEP; }
    /** How high track crossing approach cell k must be: a level over that band. */
    function corridorNeed(k) { return LEVEL + corridorBand(k); }

    /** The two edge ports (0..3 = N E S W) a piece uses in its cell. */
    function portsOf(h, type) {
        const inPort = (h + 2) % 4;                 // we enter through the side behind us
        const hOut = (h + TYPES[type].turn + 4) % 4;
        return [inPort, hOut];
    }

    function touches(a, b) {
        if (a.type === 'S' && b.type === 'S') return true;  // parallel overlap or a crossing
        const pa = portsOf(a.h, a.type), pb = portsOf(b.h, b.type);
        return pa[0] === pb[0] || pa[0] === pb[1] || pa[1] === pb[0] || pa[1] === pb[1];
    }

    /** Point and tangent along one piece at u in [0, 1] (flat; heights are added later). */
    function piecePoint(p, u) {
        const c = cellCenter(p.cx, p.cz), d = DIRS[p.h], half = TILE / 2;
        const ex = c[0] - d[0] * half, ez = c[1] - d[1] * half;
        if (p.type === 'S') return { x: ex + d[0] * TILE * u, z: ez + d[1] * TILE * u, tx: d[0], tz: d[1] };
        const d2 = DIRS[p.hOut];
        // The arc's centre is the cell corner on the inside of the turn.
        const ccx = c[0] + (d2[0] - d[0]) * half, ccz = c[1] + (d2[1] - d[1]) * half;
        const v0x = -d2[0] * half, v0z = -d2[1] * half;   // centre -> entry
        const v1x = d[0] * half, v1z = d[1] * half;       // centre -> exit
        const th = u * Math.PI / 2, cs = Math.cos(th), sn = Math.sin(th);
        const tx = -v0x * sn + v1x * cs, tz = -v0z * sn + v1z * cs, tl = Math.hypot(tx, tz) || 1;
        return { x: ccx + v0x * cs + v1x * sn, z: ccz + v0z * cs + v1z * sn, tx: tx / tl, tz: tz / tl };
    }

    function create(o) {
        o = o || {};
        const world = o.world;
        const start = { cx: o.start ? o.start.cx : 0, cz: o.start ? o.start.cz : 0, h: o.start ? o.start.h : 1 };
        const locked = o.locked || 0;          // the first pieces (a station) never ramp
        const fixed = o.fixed || null;         // fixed(i): piece i never tilts either (a station's track)
        const pieces = [];
        const jl = [0];                        // lift at each joint; jl[k] = entry of piece k
        const cells = new Map();
        const groups = [];                     // undo stack
        const datumCache = new Map();
        const sampleCache = new Map();         // world.sample by position: a growing track re-reads the same points
        let version = 0, dirtyFrom = 0;
        let cache = null;
        let steep = false;           // Connect's last resort: fall a whole level per piece

        function datumAt(x, z) {
            const k = Math.round(x * 4) + ':' + Math.round(z * 4);
            let d = datumCache.get(k);
            if (d === undefined) { d = world ? world.datum(x, z) : 0; datumCache.set(k, d); }
            return d;
        }

        function end() {
            if (!pieces.length) return { cx: start.cx, cz: start.cz, h: start.h, lift: jl[0] };
            const p = pieces[pieces.length - 1];
            const d = DIRS[p.hOut];
            return { cx: p.cx + d[0], cz: p.cz + d[1], h: p.hOut, lift: jl[pieces.length] };
        }

        function liftRange(i) { const a = jl[i], b = jl[i + 1]; return [Math.min(a, b), Math.max(a, b)]; }

        /** Which approach cell (1 = next to the start .. CORR) this is, or 0. */
        function corridorK(cx, cz) {
            if (!o.corridor) return 0;
            const d = DIRS[start.h];
            for (let k = 1; k <= CORR; k++) if (cx === start.cx - d[0] * k && cz === start.cz - d[1] * k) return k;
            return 0;
        }
        /** A piece heading home along the approach (or, in its outermost cell, turning into it). */
        function isApproach(h, type, k) {
            if (h === start.h && type === 'S') return true;
            return k === CORR && type !== 'S' && (h + TYPES[type].turn + 4) % 4 === start.h;
        }

        /**
         * How high a new piece of this type, heading h, entering at lift lin, must be to clear
         * what is in the cell: one LEVEL over everything it touches, except that the way back in
         * passes beneath a corridor crossing that is high enough.
         */
        function needAt(cx, cz, h, type, lin) {
            lin = lin || 0;
            const list = cells.get(key(cx, cz));
            const k = corridorK(cx, cz);
            const approach = k > 0 && isApproach(h, type, k);
            let need = 0;
            if (list) {
                const probe = { h: h, type: type };
                list.forEach(function (i) {
                    if (!touches(probe, pieces[i])) return;
                    const r = liftRange(i);
                    // The way in passes beneath anything a full level above it (a crossing, or
                    // earlier track that came along the approach high up).
                    if (approach && r[0] >= lin + LEVEL - 1e-6) return;
                    need = Math.max(need, r[1] + LEVEL);
                });
            }
            // Crossing the approach, or running along it too high to be coming home: stay a level
            // above the band a homecoming piece uses (it descends a STEP per cell to the start).
            if (k > 0 && (!approach || lin > corridorBand(k) + 1e-6)) need = Math.max(need, corridorNeed(k));
            if (o.extraNeed) need = Math.max(need, o.extraNeed(cx, cz, h, type) || 0);
            return need;
        }

        /**
         * What placing a piece would do, without placing it (Connect's search): the lift it
         * must enter at (raised if needed) and the lift it leaves at. steep: fall two STEPs
         * per piece instead of one (the last-resort way home).
         */
        function simulate(cx, cz, h, type, lin, steep) {
            const need = needAt(cx, cz, h, type, lin);
            const l2 = Math.max(lin, need);
            const lout = Math.max(need, l2 - (steep ? 2 * STEP : STEP));
            return { need: need, lin: l2, lout: Math.round(lout / STEP) * STEP, raised: l2 - lin };
        }

        /**
         * The highest piece i's top may go and still leave a whole level under every piece
         * above it in its cell (Infinity when nothing is above it).
         */
        function ceilingOf(i) {
            const p = pieces[i];
            const list = cells.get(key(p.cx, p.cz));
            let top = Infinity;
            if (!list) return top;
            const r = liftRange(i);
            list.forEach(function (j) {
                if (j === i || !touches(p, pieces[j])) return;
                const q = liftRange(j);
                if (q[0] >= r[1] + LEVEL - 1e-6) top = Math.min(top, q[0] - LEVEL);
            });
            return top;
        }

        /** Piece i never tilts: the locked start, or a station's track (o.fixed). */
        function holds(i) { return i >= 0 && i < pieces.length && (i < locked || !!(fixed && fixed(i))); }

        /**
         * Raise the end joint to `target`, ramping the pieces behind it a STEP each. Never a
         * piece that holds (the start station, a station's track) and never a piece up into
         * track above it; where the ramp has to stop, the piece before it is steeper (and if
         * the last piece holds, nothing is raised: the new piece starts low, steeply).
         */
        function raiseEnd(target) {
            let k = pieces.length;
            if (holds(k - 1)) return;
            let changed = k;
            jl[k] = Math.max(jl[k], target);
            for (let depth = 0; depth < MAXBACK && k - 1 > locked; depth++) {
                const want = jl[k] - STEP;
                if (jl[k - 1] >= want - 1e-6) break;
                // Joint k-1 is the top of piece k-2 and the foot of piece k-1.
                if (holds(k - 2) || holds(k - 1)) break;
                if (want > ceilingOf(k - 2) + 1e-6 || want > ceilingOf(k - 1) + 1e-6) break;
                jl[k - 1] = want;
                k--;
                changed = k;
            }
            dirtyFrom = Math.min(dirtyFrom, Math.max(0, changed - 1));
        }

        function placeOne(type, group) {
            const e = end();
            const t = TYPES[type];
            if (!t) throw new Error('Unknown piece ' + type);
            const hOut = (e.h + t.turn + 4) % 4;
            const need = needAt(e.cx, e.cz, e.h, type, jl[pieces.length]);
            if (jl[pieces.length] < need) raiseEnd(need);
            const lin = jl[pieces.length];
            const lout = Math.max(need, lin - (steep ? 2 * STEP : STEP));
            const p = { i: pieces.length, type: type, cx: e.cx, cz: e.cz, h: e.h, hOut: hOut, group: group, len: t.len };
            pieces.push(p);
            jl[pieces.length] = Math.round(lout / STEP) * STEP;
            const k = key(p.cx, p.cz);
            if (!cells.has(k)) cells.set(k, []);
            cells.get(k).push(p.i);
            return p;
        }

        /** Add one piece or a group of pieces as one undo step. Returns the new pieces. */
        function add(types, meta) {
            if (isClosed()) return [];
            const list = Array.isArray(types) ? types : [types];
            const n0 = pieces.length;
            const from = Math.max(0, n0 - MAXBACK - 2);
            groups.push({ n: n0, from: from, saved: jl.slice(from, n0 + 1), meta: meta || null });
            const g = groups.length;
            const out = [];
            dirtyFrom = Math.min(dirtyFrom, n0);
            for (const t of list) {
                out.push(placeOne(t, g));
                if (isClosed()) break;
            }
            version++;
            cache = null;
            return out;
        }

        /** Remove the last group, restoring any ramps it raised. Returns the removed pieces' count. */
        function undo() {
            const g = groups.pop();
            if (!g) return 0;
            const removed = pieces.length - g.n;
            while (pieces.length > g.n) {
                const p = pieces.pop();
                const list = cells.get(key(p.cx, p.cz));
                list.splice(list.indexOf(p.i), 1);
                if (!list.length) cells.delete(key(p.cx, p.cz));
            }
            jl.length = g.n + 1;
            for (let i = 0; i < g.saved.length; i++) jl[g.from + i] = g.saved[i];
            dirtyFrom = Math.min(dirtyFrom, g.from > 0 ? g.from - 1 : 0);
            version++;
            cache = null;
            return removed;
        }

        /**
         * Put back a saved track exactly as it was: the piece types in order and the lift at
         * every joint (lifts.length = types.length + 1). One undo group. The shape never depends
         * on how today's rules would lay those pieces, so a saved loop always comes back closed.
         */
        function restore(types, lifts) {
            const list = Array.isArray(types) ? types : String(types).split('');
            if (!lifts || lifts.length !== list.length + 1) throw new Error('restore: lifts do not match the pieces');
            const n0 = pieces.length;
            groups.push({ n: n0, from: n0, saved: jl.slice(n0, n0 + 1), meta: { restored: true } });
            const g = groups.length;
            list.forEach(function (type) {
                const e = end(), t = TYPES[type];
                if (!t) throw new Error('Unknown piece ' + type);
                const p = { i: pieces.length, type: type, cx: e.cx, cz: e.cz, h: e.h, hOut: (e.h + t.turn + 4) % 4, group: g, len: t.len };
                pieces.push(p);
                jl[pieces.length] = 0;
                const k = key(p.cx, p.cz);
                if (!cells.has(k)) cells.set(k, []);
                cells.get(k).push(p.i);
            });
            for (let i = 0; i < lifts.length; i++) jl[n0 + i] = +lifts[i] || 0;
            dirtyFrom = Math.min(dirtyFrom, Math.max(0, n0 - 1));
            version++;
            cache = null;
            return pieces.slice(n0);
        }

        /**
         * What add(types) would place, without placing it: pieces plus any raised joints, and
         * what the press makes of the track: top (its highest joint, the ramp's included),
         * steep (one of its pieces, or of its ramp, climbing or falling more than a STEP) and
         * end (where the track would end). ok: under the ceiling and not steep. With o.look = n,
         * reach: how many pieces (up to n) could still follow it, each ok too, so Build can
         * steer away from a press that would leave the track nowhere to go.
         */
        function preview(types, o) {
            if (isClosed()) return { pieces: [], raised: [], closes: false, top: 0, steep: false, end: end(), ok: false, reach: 0 };
            const v0 = version, c0 = cache, d0 = dirtyFrom;
            const before = jl.slice();
            const n0 = pieces.length;
            const placed = add(types).map(p => Object.assign({}, p, { liftIn: jl[p.i], liftOut: jl[p.i + 1] }));
            const raised = [];
            for (let i = 0; i < Math.min(before.length, jl.length); i++) if (jl[i] !== before[i]) raised.push({ joint: i, from: before[i], to: jl[i] });
            const closes = isClosed();
            // The new pieces and every piece the ramp reshaped (a raised joint tilts the piece before it too).
            let top = 0, steep = false;
            const lo = raised.length ? Math.max(0, raised[0].joint - 1) : n0;
            for (let i = lo; i < pieces.length; i++) {
                top = Math.max(top, jl[i], jl[i + 1]);
                if (Math.abs(jl[i + 1] - jl[i]) > STEP + 1e-6) steep = true;
            }
            const e = end();
            // ok: this press keeps the rules. reach: how many more pieces (up to o.look) could
            // follow it keeping them too (a closed loop needs none: full reach).
            const ok = top <= MAX_LIFT + 1e-6 && !steep;
            const look = o && o.look ? o.look : 0;
            let reach = 0;
            if (ok && look > 0) {
                if (closes) reach = look;
                else for (const t of ['S', 'L', 'R']) {
                    const q = preview(t, { look: look - 1 });
                    if (q.ok) reach = Math.max(reach, 1 + q.reach);
                    if (reach >= look) break;
                }
            }
            undo();
            // A preview is not a change: the track is exactly as it was.
            version = v0; cache = c0; dirtyFrom = d0;
            return { pieces: placed, raised: raised, closes: closes, top: top, steep: steep, end: e, ok: ok, reach: reach };
        }

        function isClosed() {
            if (pieces.length < 4) return false;
            const e = end();
            return e.cx === start.cx && e.cz === start.cz && e.h === start.h && Math.abs(jl[pieces.length] - jl[0]) < 1e-6;
        }

        // --- the centre line ---------------------------------------------------------------

        /**
         * Dense samples along the track: positions, heights, lifts, structure.
         * Cached until the track changes.
         */
        function centerline() {
            if (cache) return cache;
            const closed = isClosed();
            const xs = [], ys = [], zs = [], ss = [], pc = [], lifts = [], txs = [], tzs = [], datums = [];
            const startIndex = [];
            let s = 0;
            pieces.forEach(function (p, i) {
                startIndex.push(xs.length);
                const n = Math.max(2, Math.round(p.len / SPACING));
                const last = (i === pieces.length - 1 && !closed);
                for (let k = 0; k < n + (last ? 1 : 0); k++) {
                    const u = k / n;
                    const q = piecePoint(p, u);
                    xs.push(q.x); zs.push(q.z); txs.push(q.tx); tzs.push(q.tz);
                    lifts.push(jl[i] + (jl[i + 1] - jl[i]) * u);
                    const d = datumAt(q.x, q.z);
                    datums.push(d);
                    ss.push(s + p.len * u);
                    pc.push(i);
                }
                s += p.len;
            });
            const n = xs.length;
            // Smooth the lift so ramps round off at their joints (datum is already smooth).
            const sm = new Array(n);
            const R = 3;
            for (let i = 0; i < n; i++) {
                let sum = 0, cnt = 0;
                for (let k = -R; k <= R; k++) {
                    let j = i + k;
                    if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue;
                    sum += lifts[j]; cnt++;
                }
                sm[i] = sum / cnt;
                // Never let smoothing pull a crossing piece down into the track below it.
                const p = pieces[pc[i]];
                if (jl[p.i] === jl[p.i + 1] && jl[p.i] > 0) sm[i] = Math.max(sm[i], jl[p.i]);
            }
            for (let i = 0; i < n; i++) ys.push(datums[i] + sm[i]);
            cache = {
                n: n, x: xs, y: ys, z: zs, s: ss, piece: pc, lift: sm, tx: txs, tz: tzs,
                length: s, closed: closed, startIndex: startIndex, struct: null, ground: null, water: null
            };
            classify(cache);
            return cache;
        }

        /** Tunnel, bridge or ground for every sample, with short runs tidied away. */
        function classify(c) {
            const n = c.n;
            const st = new Array(n), gh = new Array(n), wt = new Array(n);
            for (let i = 0; i < n; i++) {
                let smp;
                if (world) {
                    const sk = Math.round(c.x[i] * 4) + ':' + Math.round(c.z[i] * 4);
                    smp = sampleCache.get(sk);
                    if (!smp) { const q = world.sample(c.x[i], c.z[i]); smp = { h: q.h, water: q.water, wet: q.wet }; sampleCache.set(sk, smp); }
                } else smp = { h: c.y[i], water: null, wet: false };
                gh[i] = smp.h;
                wt[i] = smp.wet ? smp.water : null;
                const y = c.y[i];
                if (smp.h - y > TUNNEL_D) st[i] = 'tunnel';
                else if (c.lift[i] > 0.6) st[i] = 'bridge';
                else if (smp.wet && smp.water > y - 10) st[i] = 'bridge';
                else if (y - smp.h > BRIDGE_H) st[i] = 'bridge';
                else st[i] = 'ground';
            }
            // Tidy: fill short gaps, drop slivers. Runs wrap round a closed loop.
            const runs = function () {
                const out = [];
                let i = 0;
                while (i < n) {
                    let j = i;
                    while (j + 1 < n && st[j + 1] === st[i]) j++;
                    out.push({ t: st[i], a: i, b: j, len: j - i + 1 });
                    i = j + 1;
                }
                if (c.closed && out.length > 1 && out[0].t === out[out.length - 1].t) {
                    const last = out.pop();
                    out[0].a = last.a - n;      // negative start: wraps
                    out[0].len += last.len;
                }
                return out;
            };
            const paint = function (r, t) { for (let i = r.a; i <= r.b; i++) st[(i + n) % n] = t; };
            const tidy = function (gapType, between, maxLen) {
                const rs = runs();
                for (let k = 0; k < rs.length; k++) {
                    const r = rs[k];
                    if (r.t !== gapType || r.len >= maxLen) continue;
                    const prev = rs[(k - 1 + rs.length) % rs.length], next = rs[(k + 1) % rs.length];
                    if (!c.closed && (k === 0 || k === rs.length - 1)) continue;
                    if (prev.t === between && next.t === between) paint(r, between);
                }
            };
            tidy('ground', 'tunnel', 8);
            tidy('ground', 'bridge', 5);
            tidy('bridge', 'tunnel', 4);
            // Slivers: a tunnel under 7 units is a deep cutting; a bridge under 3 is an embankment.
            runs().forEach(function (r) {
                if (r.t === 'tunnel' && r.len < 7) paint(r, 'ground');
                else if (r.t === 'bridge' && r.len < 3 && !(c.lift[(r.a + n) % n] > 0.6)) paint(r, 'ground');
            });
            c.struct = st;
            c.ground = gh;
            c.water = wt;
            // For tunnel samples: how far back to the portal they came in by, and on to the one they leave by.
            c.tFrom = new Float32Array(n); c.tTo = new Float32Array(n);
            runs().forEach(function (r) {
                if (r.t !== 'tunnel') return;
                let acc = 0;
                for (let i = r.a; i <= r.b; i++) {
                    const k = (i + n) % n, kp = (i - 1 + n) % n;
                    if (i > r.a) acc += Math.hypot(c.x[k] - c.x[kp], c.z[k] - c.z[kp]);
                    c.tFrom[k] = acc;
                }
                const total = acc;
                for (let i = r.a; i <= r.b; i++) { const k = (i + n) % n; c.tTo[k] = total - c.tFrom[k]; }
            });
        }

        // --- the track's mark on the ground -----------------------------------------------

        let index = null, indexVersion = -1;
        const IDX = 8;
        function spatialIndex() {
            if (index && indexVersion === version) return index;
            const c = centerline();
            index = new Map();
            for (let i = 0; i < c.n; i++) {
                const k = Math.floor(c.x[i] / IDX) + ',' + Math.floor(c.z[i] / IDX);
                if (!index.has(k)) index.set(k, []);
                index.get(k).push(i);
            }
            indexVersion = version;
            return index;
        }

        /**
         * How the track reshapes the ground at (x, z) whose natural height is gh.
         * Returns the new height (flattened under ground-level track, cut and
         * filled with soft banks; bridges and tunnels leave the ground alone).
         * Also reports `clear`: true within the corridor where props must not stand.
         */
        function shapeGround(x, z, gh, out) {
            const c = centerline();
            const idx = spatialIndex();
            const cx = Math.floor(x / IDX), cz = Math.floor(z / IDX);
            let bestW = 0, bestY = 0, near = Infinity, cover = -Infinity;
            const R = 3;
            for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
                const list = idx.get((cx + dx) + ',' + (cz + dz));
                if (!list) continue;
                for (let k = 0; k < list.length; k++) {
                    const i = list[k];
                    const d = Math.hypot(x - c.x[i], z - c.z[i]);
                    const stt = c.struct[i];
                    // Props keep clear of any track that is near their height.
                    if (stt !== 'tunnel' || c.ground[i] - c.y[i] < 12) near = Math.min(near, d);
                    // Over a tunnel the hill always keeps a roof over the bore (even where a
                    // cutting's banks would otherwise dig into it).
                    if (stt === 'tunnel' && d < 9) {
                        // ...but only between its portals, never out in front of them.
                        const a = (x - c.x[i]) * c.tx[i] + (z - c.z[i]) * c.tz[i];
                        if (a > -c.tFrom[i] + 1.5 && a < c.tTo[i] - 1.5) cover = Math.max(cover, c.y[i] + 7.4 - 3.5 * U.smoothstep(5, 9, d));
                    }
                    if (stt !== 'ground') continue;
                    const y = c.y[i] - 0.55;
                    const margin = Math.min(16, 3.2 + 1.25 * Math.abs(gh - y));
                    const w = 1 - U.smoothstep(3.6, 3.6 + margin, d);
                    if (w > bestW) { bestW = w; bestY = y; }
                }
            }
            const h = bestW > 0 ? gh + (bestY - gh) * bestW : gh;
            // dh: the cut or fill alone; cover: the roof kept over tunnels (for combining several tracks).
            if (out) { out.near = near; out.w = bestW; out.dh = h; out.cover = cover; }
            return Math.max(h, Math.min(cover, gh + 4));
        }

        /** Is some OTHER part of the track (more than `gap` samples away from sample i) within r of (x, z)? */
        function nearOther(x, z, i, r, gap) {
            const c = centerline();
            const idx = spatialIndex();
            gap = gap || 25;
            const R = Math.ceil(r / IDX);
            const cx = Math.floor(x / IDX), cz = Math.floor(z / IDX);
            for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
                const list = idx.get((cx + dx) + ',' + (cz + dz));
                if (!list) continue;
                for (let k = 0; k < list.length; k++) {
                    const j = list[k];
                    let d = Math.abs(j - i);
                    if (c.closed) d = Math.min(d, c.n - d);
                    if (d <= gap) continue;
                    if (Math.hypot(x - c.x[j], z - c.z[j]) < r) return true;
                }
            }
            return false;
        }

        // --- stations ------------------------------------------------------------------------

        /**
         * Where stations go: one per zone, on the longest run of level, ground-level
         * straights in that zone (at least `min` pieces). Each: { zone, name, biome,
         * piece (the middle piece), pieces, side: 1 right / -1 left of travel }.
         */
        function stationSites(opts) {
            opts = opts || {};
            const min = opts.min || 3;
            const c = centerline();
            if (!world) return [];
            const runs = [];
            let run = null;
            const okPiece = function (p) {
                if (p.type !== 'S' || jl[p.i] !== 0 || jl[p.i + 1] !== 0) return false;
                const a = c.startIndex[p.i];
                for (let k = 0; k < 14; k++) if (c.struct[a + k] && c.struct[a + k] !== 'ground') return false;
                return true;
            };
            pieces.forEach(function (p) {
                const mid = piecePoint(p, 0.5);
                const zone = world.zoneAt(mid.x, mid.z);
                if (okPiece(p) && run && run.zone.key === zone.key && p.h === run.h && run.last === p.i - 1) {
                    run.pieces.push(p.i); run.last = p.i;
                } else if (okPiece(p)) {
                    run = { zone: zone, h: p.h, pieces: [p.i], last: p.i };
                    runs.push(run);
                } else run = null;
            });
            const best = {};
            runs.forEach(function (r) {
                if (r.pieces.length < min) return;
                const b = best[r.zone.key];
                if (!b || r.pieces.length > b.pieces.length) best[r.zone.key] = r;
            });
            return Object.keys(best).map(function (k) {
                const r = best[k];
                const midPiece = r.pieces[Math.floor((r.pieces.length - 1) / 2)];
                const p = pieces[midPiece];
                const m = piecePoint(p, r.pieces.length % 2 ? 0.5 : 1);
                // Platform on the side with the gentler, drier ground.
                const d = DIRS[p.h], side = [-d[1], d[0]];   // to the right of travel
                const probe = s => { const q = world.sample(m.x + side[0] * 7 * s, m.z + side[1] * 7 * s); return (q.wet ? 50 : 0) + Math.abs(q.h - datumAt(m.x, m.z)); };
                return { zone: r.zone.key, name: r.zone.name, biome: r.zone.biome, piece: midPiece, pieces: r.pieces.slice(), side: probe(1) <= probe(-1) ? 1 : -1, at: r.pieces.length % 2 ? 0.5 : 1 };
            }).sort((a, b) => a.piece - b.piece);
        }

        return {
            TILE: TILE,
            world: world,
            start: start,
            pieces: pieces,
            add: add,
            undo: undo,
            restore: restore,
            /** Every joint's lift (for saving: restore(types, lifts) puts the track back). */
            lifts: function () { return jl.slice(0, pieces.length + 1); },
            preview: preview,
            end: end,
            closed: isClosed,
            centerline: centerline,
            shapeGround: shapeGround,
            nearOther: nearOther,
            stationSites: stationSites,
            simulate: simulate,
            corridorK: corridorK,
            setSteep: function (on) { steep = !!on; },
            holds: holds,
            liftIn: function (i) { return jl[i]; },
            liftOut: function (i) { return jl[i + 1]; },
            piecePoint: function (i, u) { return piecePoint(pieces[i], u); },
            jointHeight: function (i) {
                const p = i < pieces.length ? piecePoint(pieces[i], 0) : piecePoint(pieces[i - 1], 1);
                return datumAt(p.x, p.z) + jl[i];
            },
            cellPieces: function (cx, cz) { return (cells.get(key(cx, cz)) || []).slice(); },
            groupCount: function () { return groups.length; },
            /** Every undo group's meta, oldest first (Build saves the player's presses from these). */
            groupMetas: function () { return groups.map(g => g.meta); },
            /** How many undo groups' meta pass fn (Build: the player's presses). */
            countGroups: function (fn) { let n = 0; groups.forEach(g => { if (fn(g.meta)) n++; }); return n; },
            groupMeta: function () { return groups.length ? groups[groups.length - 1].meta : null; },
            version: function () { return version; },
            dirtyFrom: function () { return dirtyFrom; },
            clearDirty: function () { dirtyFrom = pieces.length; },
            types: function () { return pieces.map(p => p.type).join(''); },
            datumAt: datumAt
        };
    }

    /**
     * Pieces that trace a rectilinear loop through corner cells, e.g.
     * [[0,0],[10,0],[10,6],[0,6]]: straight runs between corners, a curve on
     * each corner cell. The loop starts in the first cell heading toward the
     * second and must come back into it the same way.
     */
    function fromCorners(corners) {
        const out = [];
        const n = corners.length;
        const dirOf = function (a, b) {
            const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
            if (dx && dz) throw new Error('Corners must line up: ' + a + ' -> ' + b);
            return DIRS.findIndex(d => d[0] === dx && d[1] === dz);
        };
        const h0 = dirOf(corners[0], corners[1]);
        let h = h0;
        for (let k = 0; k < n; k++) {
            const a = corners[k], b = corners[(k + 1) % n];
            const hSeg = dirOf(a, b);
            const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
            if (k === 0) out.push('S');
            else {
                const turn = (hSeg - h + 4) % 4;
                if (turn === 1) out.push('R'); else if (turn === 3) out.push('L');
                else throw new Error('Corner ' + k + ' turns back on itself');
            }
            h = hSeg;
            for (let i = 1; i < len; i++) out.push('S');
        }
        // Coming back into the first cell: it must be a straight in the start heading.
        if (h !== h0) throw new Error('The loop must come back heading the way it started');
        return { start: { cx: corners[0][0], cz: corners[0][1], h: h0 }, types: out };
    }

    return {
        create: create,
        fromCorners: fromCorners,
        TILE: TILE,
        LEVEL: LEVEL,
        CORR: CORR,
        STEP: STEP,
        MAX_LIFT: MAX_LIFT,
        MAXBACK: MAXBACK,
        CORR_BAND: CORR_BAND,
        corridorBand: corridorBand,
        corridorNeed: corridorNeed,
        DIRS: DIRS,
        NAMES: NAMES,
        TYPES: TYPES,
        TUNNEL_D: TUNNEL_D,
        BRIDGE_H: BRIDGE_H,
        piecePoint: piecePoint,
        portsOf: portsOf
    };
})();
