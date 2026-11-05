/**
 * NARBE Build n Bash - how a build comes down in chunks.
 *
 * Small builds fall in one Destroy press. Bigger ones take about one press
 * per 15 blocks: each press knocks down a vertical slice from the left or
 * right edge, and every block resting on that slice comes down with it, so
 * nothing is ever left hanging in the air. What is left stays standing
 * (frozen) until a later press reaches it.
 *
 * Pure logic, no Three.js, no physics: the Node tests run it directly.
 */

window.BNB = window.BNB || {};

BNB.Chunks = (function () {
    'use strict';

    const PER_PRESS = 15;

    function rng(seed) {
        let s = (seed >>> 0) || 7;
        return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }

    /** How many presses a build of `count` blocks takes. */
    function presses(count, chunked) {
        if (!chunked || count <= 8) return 1;
        return Math.max(1, Math.ceil(count / PER_PRESS));
    }

    /**
     * Plan every chunk for the first `placed` blocks of `blocks`.
     * Returns [{ ids: [...], side: -1 (from the left) | 1 (from the right), final }].
     */
    function plan(blocks, placed, opts) {
        opts = opts || {};
        const rand = rng(opts.seed || 1);
        const rel = BNB.Builds.relations(blocks);
        const K = presses(placed, opts.chunked !== false);
        const remaining = new Set();
        for (let i = 0; i < placed; i++) remaining.add(i);
        const out = [];
        let side = rand() < 0.5 ? -1 : 1;
        for (let c = 0; c < K && remaining.size; c++) {
            const left = K - c;
            if (left === 1) {
                out.push({ ids: Array.from(remaining).sort((a, b) => a - b), side: rand() < 0.5 ? -1 : 1, final: true });
                remaining.clear();
                break;
            }
            const target = Math.ceil(remaining.size / left);
            const lead = i => (side < 0 ? rel.bounds[i].min[0] : -rel.bounds[i].max[0]);
            const order = Array.from(remaining).sort(function (a, b) {
                const d = lead(a) - lead(b);
                return Math.abs(d) > 0.05 ? d : rel.bounds[a].min[1] - rel.bounds[b].min[1];
            });
            const seedIds = order.slice(0, target);
            const closure = BNB.Builds.dependents(blocks, seedIds, placed);
            const ids = Array.from(closure).filter(i => remaining.has(i)).sort((a, b) => a - b);
            ids.forEach(i => remaining.delete(i));
            out.push({ ids: ids, side: side, final: remaining.size === 0 });
            side = -side;
        }
        return out;
    }

    return { PER_PRESS: PER_PRESS, presses: presses, plan: plan };
})();
