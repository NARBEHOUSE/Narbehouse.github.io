/**
 * NARBE Build n Ride - Connect: finish the loop automatically.
 *
 * An A* search over (cell, heading, lift) from the end of the track back to
 * the start, arriving with the start's heading at ground level. It moves with
 * the same pieces the player has (straight, left, right) and the same rules
 * the track itself uses (BNR.Track simulate: over anything it touches, ramps
 * of half a level per piece), so the pieces it returns lay exactly as planned.
 *
 *   BNR.Path.connect(track)  ->  ['S', 'L', 'S', ...]   (never null in practice)
 *
 * It tries the gentle way first (prefers ground level, few turns, short),
 * then a wider search that may fall two STEPs per piece (steep); neither ever
 * climbs above the track's ceiling (BNR.Track.MAX_LIFT, two levels). The
 * start's protected approach (o.corridor in js/track.js) keeps a way home open
 * in ordinary building; close() also rewinds the newest pieces as a last
 * resort (a tower built right in the approach), so Connect always succeeds.
 * Runs in Node.
 */

window.BNR = window.BNR || {};

BNR.Path = (function () {
    'use strict';

    const ORDER = ['S', 'L', 'R'];
    const RAISE = 4;                  // the most (in STEPs) the gentle search lifts the end at once (over a station)

    /** A small binary heap of [f, node]. */
    function Heap() { this.a = []; }
    Heap.prototype.push = function (f, v) {
        const a = this.a;
        a.push([f, v]);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p][0] <= a[i][0]) break;
            const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
        }
    };
    Heap.prototype.pop = function () {
        const a = this.a, top = a[0], last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1, r = l + 1;
                let m = i;
                if (l < a.length && a[l][0] < a[m][0]) m = l;
                if (r < a.length && a[r][0] < a[m][0]) m = r;
                if (m === i) break;
                const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
            }
        }
        return top;
    };
    Heap.prototype.size = function () { return this.a.length; };

    function search(track, o) {
        const T = BNR.Track;
        const STEP = T.STEP;
        const start = track.start;
        const e = track.end();
        // Search inside the track's box plus a margin of free land.
        let x0 = Math.min(e.cx, start.cx), x1 = Math.max(e.cx, start.cx), z0 = Math.min(e.cz, start.cz), z1 = Math.max(e.cz, start.cz);
        track.pieces.forEach(p => { x0 = Math.min(x0, p.cx); x1 = Math.max(x1, p.cx); z0 = Math.min(z0, p.cz); z1 = Math.max(z1, p.cz); });
        const M = o.margin;
        x0 -= M; x1 += M; z0 -= M; z1 += M;
        const keyOf = (cx, cz, h, l) => ((cx * 4096 + cz) * 4 + h) * 1024 + l;
        const LEN = { S: T.TYPES.S.len, L: T.TYPES.L.len, R: T.TYPES.R.len };
        const minLen = Math.min(LEN.L, LEN.S);
        const hcost = function (cx, cz, h, l) {
            const man = Math.abs(cx - start.cx) + Math.abs(cz - start.cz);
            return minLen * Math.max(man, l);
        };
        // Never above the track's ceiling (two levels), wherever the end is.
        const maxLift = Math.max(Math.round(T.MAX_LIFT / STEP), Math.round(e.lift / STEP));
        const startNode = { cx: e.cx, cz: e.cz, h: e.h, l: Math.round(e.lift / STEP), g: 0, prev: null, type: null, d: 0 };
        const open = new Heap();
        const best = new Map();
        // Weighted A*: leaning on the estimate finds a near-shortest way much faster.
        const W = o.weight || 1.6;
        open.push(W * hcost(startNode.cx, startNode.cz, startNode.h, startNode.l), startNode);
        best.set(keyOf(startNode.cx, startNode.cz, startNode.h, startNode.l), 0);
        // The pieces at the end that a ramp may tilt (none past a station or the start): a raise
        // n pieces into the way home has those and the n laid since to climb on.
        let free = 0;
        while (free < T.MAXBACK && track.pieces.length - 1 - free >= 0 && !(track.holds && track.holds(track.pieces.length - 1 - free))) free++;
        let expanded = 0;
        while (open.size() && expanded < o.maxNodes) {
            const node = open.pop()[1];
            const k0 = keyOf(node.cx, node.cz, node.h, node.l);
            if (best.get(k0) < node.g - 1e-9) continue;
            if (node.cx === start.cx && node.cz === start.cz && node.h === start.h && node.l === 0 && node.prev) {
                const out = [];
                for (let n = node; n.prev; n = n.prev) out.push(n.type);
                return out.reverse();
            }
            expanded++;
            for (const type of ORDER) {
                const sim = track.simulate(node.cx, node.cz, node.h, type, node.l * STEP, o.steep);
                // A raise is only possible a few pieces back (or steeply, as a last resort).
                // After a station (its pieces never tilt) a ramp only has the pieces laid since.
                const room = Math.min(RAISE, node.d + free);
                if (sim.raised > room * STEP + 1e-6 && !o.steep) continue;
                const lout = Math.round(sim.lout / STEP);
                if (lout > maxLift) continue;
                const hOut = (node.h + T.TYPES[type].turn + 4) % 4;
                const d = T.DIRS[hOut];
                const nx = node.cx + d[0], nz = node.cz + d[1];
                if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
                // Turns cost extra, so the way home runs in long straights with a few turns
                // (not a staircase of left-right wiggles), at no cost in length.
                let cost = LEN[type] + (type === 'S' ? 0 : 6) + (lout > 0 ? 3 : 0) + sim.raised * 2 + (sim.need > 0 ? 6 : 0);
                if (o.steep && sim.lout < sim.lin - STEP - 1e-6) cost += 25;
                const g = node.g + cost;
                const k = keyOf(nx, nz, hOut, lout);
                if (best.has(k) && best.get(k) <= g) continue;
                best.set(k, g);
                open.push(g + W * hcost(nx, nz, hOut, lout), { cx: nx, cz: nz, h: hOut, l: lout, g: g, prev: node, type: type, d: node.d + 1 });
            }
        }
        return null;
    }

    /**
     * The pieces that close the loop from the track's end. Returns an array of
     * types (with .steep = true when it must be laid steeply), or null if the
     * track is already closed.
     */
    function connect(track, o) {
        o = o || {};
        if (track.closed()) return null;
        let r = search(track, { margin: o.margin || 10, maxNodes: o.maxNodes || 60000, steep: false });
        if (r) { r.steep = false; return r; }
        r = search(track, { margin: 18, maxNodes: o.quick ? 30000 : 120000, steep: true });
        if (r) { r.steep = true; return r; }
        return null;
    }

    /**
     * Plan and lay until the loop closes (a path that crosses itself can lay a little
     * differently from its plan; then it plans again from where it got to).
     * closeSteps(track) does it one change at a time (a generator: it yields
     * { op: 'add', placed } or { op: 'undo' } after each), so Build mode can show each
     * piece going down; close() runs it straight through.
     */
    function* closeSteps(track) {
        const stats = { rewound: 0, plans: 0 };
        closeSteps.last = stats;
        const rewind = function () {
            if (track.groupCount() <= 1) return false;   // only the start station is left
            stats.rewound += track.undo();
            return true;
        };
        for (let attempt = 0; attempt < 600 && !track.closed(); attempt++) {
            const types = connect(track, { quick: stats.rewound > 0 });
            if (types) {
                stats.plans++;
                const g0 = track.groupCount();
                for (let i = 0; i < types.length && !track.closed(); i++) {
                    // Steep only for this one add, so nothing else ever sees steep mode left on.
                    track.setSteep(!!types.steep);
                    let placed;
                    try { placed = track.add(types[i], { connect: true }); } finally { track.setSteep(false); }
                    yield { op: 'add', placed: placed, steep: !!types.steep, left: types.length - i - 1 };
                    // Crossing its own new pieces can lift it over the ceiling, or a ramp can find no
                    // room (a gentle plan laying a steep piece): then the plan fails.
                    if (tooHigh(track) || (!types.steep && steepEnd(track))) break;
                }
                if (track.closed() && !tooHigh(track) && (types.steep || !steepEnd(track))) break;
                // The plan didn't hold (it crossed itself): take its pieces back up.
                while (track.groupCount() > g0) { track.undo(); yield { op: 'undo' }; }
            }
            // Last resort: no way home from here (say, a tower built right in the start's
            // approach). Rewind the newest pieces until the approach is clear, then try again.
            if (blocked(track)) {
                while (blocked(track) && rewind()) yield { op: 'undo', rewind: true };
                continue;
            }
            if (!rewind()) break;
            yield { op: 'undo', rewind: true };
        }
        return track.closed();
    }

    /** Does any of the newest pieces (the last add and the ramp it raised) climb more than a STEP? */
    function steepEnd(track) {
        const T = BNR.Track, n = track.pieces.length;
        for (let i = Math.max(0, n - T.MAXBACK - 2); i < n; i++) if (Math.abs(track.liftOut(i) - track.liftIn(i)) > T.STEP + 1e-6) return true;
        return false;
    }

    /** Is any of the newest joints above the ceiling (the last add and the ramp it raised)? */
    function tooHigh(track) {
        const T = BNR.Track, n = track.pieces.length;
        for (let i = Math.max(0, n - T.MAXBACK - 2); i <= n; i++) {
            const l = i < n ? track.liftIn(i) : track.liftOut(n - 1);
            if (l > T.MAX_LIFT + 1e-6) return true;
        }
        return false;
    }

    function close(track, onPiece, onUndo) {
        const it = closeSteps(track);
        let k = 0;
        for (let r = it.next(); !r.done; r = it.next()) {
            if (r.value.op === 'add') { if (onPiece) onPiece(k++, r.value.placed); }
            else if (onUndo) onUndo();
        }
        close.last = closeSteps.last;
        return track.closed();
    }

    /**
     * Is the start's approach blocked? Something low enough in an approach cell that a
     * piece coming home at ground level could not pass beneath it.
     */
    function blocked(track) {
        const T = BNR.Track, start = track.start, d = T.DIRS[start.h];
        for (let k = 1; k <= T.CORR; k++) {
            const list = track.cellPieces(start.cx - d[0] * k, start.cz - d[1] * k);
            for (const i of list) {
                const lo = Math.min(track.liftIn(i), track.liftOut(i));
                if (lo < T.corridorNeed(k) - 1e-6) return true;
            }
        }
        return false;
    }

    /** Lay a Connect path on the track, one piece at a time (onPiece(i, pieces) after each). */
    function lay(track, types, onPiece) {
        track.setSteep(!!types.steep);
        try {
            for (let i = 0; i < types.length && !track.closed(); i++) {
                const placed = track.add(types[i], { connect: true });
                if (onPiece) onPiece(i, placed);
            }
        } finally { track.setSteep(false); }
        return track.closed();
    }

    return { connect: connect, lay: lay, close: close, closeSteps: closeSteps, blocked: blocked };
})();
