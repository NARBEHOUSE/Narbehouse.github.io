/**
 * Whispering Lake — the chart, and the one place its maths lives.
 *
 * content/lake.json says what the lake IS: a shoreline, an island, depth
 * soundings in feet, the ledges where the bottom steps, and what each stage of
 * vessel can reach. This turns that description into answers - how deep is it
 * here, is this water, what stage of water is it, can I get there yet.
 *
 * ONE IMPLEMENTATION, THREE CONSUMERS: the 3D world builds its bed from this,
 * the editor draws its chart from this, and the tools measure it with this.
 * The last version of this game had a map generated one way and a world built
 * another, and they disagreed for a week before anyone noticed - so there is
 * deliberately nowhere else to put a second copy of these sums.
 *
 * Runs in the browser and in Node, because the tools need it too.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RT = root.RT || {};
  root.RT.lake = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SHELF_UNITS = 110;     // how far the bed takes to climb out of a beach
  const SPLINE_PER = 10;       // samples per shoreline control point

  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  /** A closed uniform cubic B-spline through control points. */
  function spline(pts, per) {
    per = per || SPLINE_PER;
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
      const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let j = 0; j < per; j++) {
        const t = j / per, t2 = t * t, t3 = t2 * t;
        const b0 = (-t3 + 3 * t2 - 3 * t + 1) / 6;
        const b1 = (3 * t3 - 6 * t2 + 4) / 6;
        const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
        const b3 = t3 / 6;
        out.push([
          b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
          b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
        ]);
      }
    }
    return out;
  }

  function inside(ring, x, z) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > z) !== (b[1] > z) &&
          x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }

  function distToRing(ring, x, z) {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L2 = dx * dx + dz * dz || 1;
      let t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / L2);
      const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Distance to an open polyline, and which side of it we are on.
   *
   * The side is the sign of the cross product against the NEAREST segment, so
   * it stays consistent along the whole line provided the line does not double
   * back on itself. A ledge that doubled back would not mean anything anyway.
   */
  function toLine(line, x, z) {
    let best = Infinity, side = 1;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L2 = dx * dx + dz * dz || 1;
      const t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / L2);
      const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (d < best) {
        best = d;
        side = Math.sign(dx * (z - a[1]) - dz * (x - a[0])) || 1;
      }
    }
    return { d: best, side: side };
  }

  /**
   * Build a chart from a lake description.
   *
   * Splines the shorelines once and keeps them, because everything else asks
   * about them constantly and re-splining per query would make the bed mesh
   * cost minutes rather than moments.
   */
  function chart(doc) {
    const shore = spline(doc.shore);
    const island = doc.island && doc.island.length ? spline(doc.island) : null;
    const soundings = doc.soundings || [];
    const ledges = doc.ledges || [];
    const stages = doc.stages || [];
    const dock = doc.dock || { x: 0, z: 0 };

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    shore.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    });

    /** Is this water at all? */
    function inWater(x, z) {
      if (!inside(shore, x, z)) return false;
      if (island && inside(island, x, z)) return false;
      return true;
    }

    /** How far from the nearest shore, the island's counting as shore. */
    function toShore(x, z) {
      const a = distToRing(shore, x, z);
      return island ? Math.min(a, distToRing(island, x, z)) : a;
    }

    /**
     * Depth in feet.
     *
     * Three things, in this order: the open bed as a blend of the soundings,
     * then any ledge near this point, then the shelf that pulls everything to
     * nothing at the shore. The shelf goes LAST because a beach beats
     * everything - a forty-five foot sounding must not turn the bank into a
     * cliff.
     */
    function depthAt(x, z) {
      if (!inWater(x, z)) return 0;

      // The open bed. Inverse fourth power, so a sounding shapes the water
      // near it rather than smearing across the whole lake.
      let num = 0, den = 0;
      for (let i = 0; i < soundings.length; i++) {
        const s = soundings[i];
        const dx = x - s.x, dz = z - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1) { num = s.ft; den = 1; break; }
        const w = 1 / (d2 * d2);
        num += s.ft * w;
        den += w;
      }
      let ft = den > 0 ? num / den : 0;

      /* Ledges. Soundings cannot describe a step: blending 16 ft and 32 ft
         gives a slope, and a slope is not a drop-off. So near a ledge the
         depth IS the step, fading back to the open bed over `reach`.
         
         Worked as a SIGNED distance across the line - negative on the near
         side, positive on the far one - because the first attempt juggled the
         side flag inside the interpolation and got the drop-off backwards:
         twenty-eight feet on the town side and eighteen out in the deep. */
      for (let i = 0; i < ledges.length; i++) {
        const L = ledges[i];
        const hit = toLine(L.line, x, z);
        if (hit.d > L.reach) continue;

        /* toLine's side is +1 to the south for a line running west to east,
           and south is the town side - the side `nearFt` describes. So the
           FAR side is -side, and this makes `u` negative near, positive far. */
        const u = -hit.side * hit.d;
        const t = smooth(clamp01((u / L.width + 1) / 2));
        const stepped = L.nearFt + (L.farFt - L.nearFt) * t;

        // Full effect on the line, fading to the open bed by `reach`.
        const hold = 1 - smooth(clamp01(hit.d / L.reach));
        ft += (stepped - ft) * hold;
      }

      const ts = toShore(x, z);
      /* The beach. The bed climbs out of the water over SHELF_UNITS, and it
         climbs FAST at first - a square root, not a smoothstep - because a
         smoothstep left the end of a fifty-foot jetty in three inches of
         water, and nothing lives in three inches of water. Off the dock
         itself the shelf is dredged: half depth or better within 60 units, so
         the jetty end has a couple of feet under it for the minnows. */
      if (ts < SHELF_UNITS) ft *= Math.sqrt(clamp01(ts / SHELF_UNITS));

      /* THE BOAT BASIN. Dug out at the town dock, the way a working dock is:
         four feet at the mooring, shelving back to the natural bottom about a
         hundred units out. Two things depend on it. A hull floats at the
         jetty - the motorboat draws over two feet and used to have to be
         walked a long way out before it would sit in the water. And the
         panfish written into the roster as living "thick under the dock all
         summer" need two feet to live in, so without the basin the first hour
         of the game was fished over water nothing could be caught in. */
      const dd = Math.hypot(x - dock.x, z - dock.z);
      if (dd < 120) ft = Math.max(ft, 4.2 * (1 - smooth(clamp01((dd - 55) / 65))));
      return ft;
    }

    /** Which stage's water this is, by depth. */
    function stageAt(x, z) {
      const ft = depthAt(x, z);
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        if (ft >= s.depthFt[0] && ft < s.depthFt[1]) return s.id;
      }
      return ft > 0 ? (stages[stages.length - 1] || {}).id || null : null;
    }

    /** How far from the dock. What every reach is measured against. */
    function fromDock(x, z) { return Math.hypot(x - dock.x, z - dock.z); }

    /** Can this stage get here? Range, not depth: deep water is simply far. */
    function reachable(stageId, x, z) {
      const s = stages.find(function (q) { return q.id === stageId; });
      if (!s) return false;
      return inWater(x, z) && fromDock(x, z) <= s.reach;
    }

    function stage(id) { return stages.find(function (s) { return s.id === id; }) || null; }

    /* ── Barriers ─────────────────────────────────────────────────────────
       Things in the water a hull cannot cross. So far there is one: the
       submerged log jam, which runs bank to bank across the narrows with a
       channel left open in the middle.

       Worked out here, on the chart, because four different parts of the
       game need to agree about it to the unit - the timber that gets drawn,
       the hull that stops at it, the arrow that points through the gap, and
       the chart that shows the player where the gap is. Anywhere else and
       one of them ends up drawing a jam somewhere the boat can sail.

       The ends are FOUND, not written down: walk out from the place along
       the line until the water stops. Move the shore in the editor and the
       jam still reaches it. */
    const BAR_HALF = 20;        // how thick the piled timber is, either side
    const GAP_HALF = 45;        // half the channel: ninety units of open water

    function barrierOf(p) {
      const z = p.z;
      let fromX = p.x, toX = p.x;
      for (let i = 0; i < 900 && inWater(fromX - 4, z); i++) fromX -= 4;
      for (let i = 0; i < 900 && inWater(toX + 4, z); i++) toX += 4;
      const gapX = p.gapX === undefined ? (fromX + toX) / 2 : p.gapX;
      return {
        id: p.id, kind: p.feature, label: p.label || 'the log jam',
        x: p.x, z: z, fromX: fromX, toX: toX,
        gapX: gapX, gapHalf: p.gapHalf === undefined ? GAP_HALF : p.gapHalf,
        half: BAR_HALF,
      };
    }

    const barriers = (doc.places || [])
      .filter(function (p) { return p.feature === 'logjam'; })
      .map(barrierOf);

    /** Is this point inside the piled timber - as opposed to the channel? */
    function inBarrier(x, z) {
      for (let i = 0; i < barriers.length; i++) {
        const b = barriers[i];
        if (Math.abs(z - b.z) > b.half) continue;
        if (x < b.fromX - 6 || x > b.toX + 6) continue;
        if (Math.abs(x - b.gapX) <= b.gapHalf) continue;   // the way through
        return b;
      }
      return null;
    }

    /**
     * Does the straight line from one point to another cross the timber?
     *
     * Asked rather than sampled, because a look-ahead that samples every
     * thirty units steps straight over a forty-unit bar and reports clear
     * water - which is how a boat ends up nosed into the logs with the helm
     * saying there was nothing there.
     */
    function crossesBarrier(x0, z0, x1, z1) {
      for (let i = 0; i < barriers.length; i++) {
        const b = barriers[i];
        /* Which side of the line each end is on. Same side, no crossing. */
        const d0 = z0 - b.z, d1 = z1 - b.z;
        if ((d0 > b.half && d1 > b.half) || (d0 < -b.half && d1 < -b.half)) continue;
        /* Where it crosses the middle of the bar, and whether that is in the
           channel. A leg that starts or ends INSIDE the bar is checked at
           whichever end is in there. */
        const t = Math.abs(d1 - d0) < 1e-6 ? 0 : (0 - d0) / (d1 - d0);
        const at = t >= 0 && t <= 1 ? x0 + (x1 - x0) * t
                 : Math.abs(d0) < Math.abs(d1) ? x0 : x1;
        if (at < b.fromX - 6 || at > b.toX + 6) continue;
        if (Math.abs(at - b.gapX) <= b.gapHalf) continue;
        return b;
      }
      return null;
    }

    /** The nearest way through, for anything routing round a barrier. */
    function channelFor(b) { return { x: b.gapX, z: b.z }; }

    return {
      doc: doc, name: doc.name || 'the lake',
      shore: shore, island: island, soundings: soundings, ledges: ledges,
      stages: stages, dock: dock,
      extent: { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ },
      inWater: inWater, depthAt: depthAt, stageAt: stageAt,
      toShore: toShore, fromDock: fromDock, reachable: reachable, stage: stage,
      /* What is in the water that a boat cannot go through, and the way
         round it. One answer, read by the art, the hull, the arrow and the
         chart alike. */
      barriers: barriers, inBarrier: inBarrier, crossesBarrier: crossesBarrier,
      channelFor: channelFor,
    };
  }

  return { chart: chart, spline: spline, inside: inside, distToRing: distToRing };
}));
