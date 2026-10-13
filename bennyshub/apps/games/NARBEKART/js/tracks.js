/**
 * NARBE Racer — sixteen complete circuits in four cups, with mirrored
 * lane/edge layouts.
 *
 * Beyond the road's shape, a circuit can carry set pieces:
 *   ramps[i].gap   a full-width jump over a landscape (creek, canyon, moat…):
 *                  the road stops at the ramp's lip and resumes before the
 *                  landing, and world.js builds the named landscape between;
 *   pieces         { kind:'loop', at, side } a loop-de-loop on a flat straight
 *                  (side = which way the way down steps across, +1 right);
 *                  { kind:'falls', at, air?, style?, gate? } a curtain the
 *                  karts burst through (air: mid-jump, poured from a sky
 *                  island; style: water | bubbles | steam | hologram |
 *                  confetti; gate: a themed archway prop framing it);
 *                  { kind:'arches', at, prop, count?, spacing? } a run of
 *                  archway props over the road (a ribcage, coral rings…);
 *   islands        [[from, to], ...] the floating islands of a sky circuit:
 *                  everywhere else the road is a bridge over the clouds;
 *   opts.banks     berm zones [[from, to, maxBank], ...] (see spline.js).
 */
NK.tracks = (function () {
  'use strict';

  const TAU = Math.PI * 2;
  const wrap = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

  /* ── Layout builder: a belt around corner circles ───────────────────── */
  function buildLayout(layout) {
    const C = layout.corners.map((c) => ({ x: c[0], z: c[1], r: c[2], s: c[3] === 'R' ? 1 : -1 }));
    const n = C.length;

    const lines = [];
    for (let i = 0; i < n; i++) {
      const A = C[i], B = C[(i + 1) % n];
      const dx = B.x - A.x, dz = B.z - A.z;
      const D = Math.hypot(dx, dz);
      const q = B.s * B.r - A.s * A.r;
      if (Math.abs(q) >= D) throw new Error('corners ' + (i + 1) + ' and ' + ((i + 1) % n + 1) + ' are too close to join');
      const phi = Math.atan2(dz, dx);
      const h = phi + Math.acos(q / D);
      const rx = Math.cos(h), rz = Math.sin(h);
      lines.push({ h: h, ax: A.x - A.s * A.r * rx, az: A.z - A.s * A.r * rz, len: D * Math.sin(h - phi) });
    }

    const pieces = [];
    const last = lines[n - 1];
    const start = layout.start;
    if (!(start > 0 && start < last.len)) throw new Error('start must sit on the final straight (0..' + last.len.toFixed(0) + ' m)');
    const back = last.len - start;
    pieces.push({ kind: 'line', x: last.ax + Math.sin(last.h) * back, z: last.az - Math.cos(last.h) * back, h: last.h, len: start });
    for (let i = 0; i < n; i++) {
      const hIn = lines[(i - 1 + n) % n].h, hOut = lines[i].h;
      const sweep = C[i].s > 0 ? wrap(hOut - hIn) : wrap(hIn - hOut);
      pieces.push({ kind: 'arc', c: C[i], corner: i + 1, hIn: hIn, sweep: sweep, len: C[i].r * sweep });
      pieces.push({ kind: 'line', x: lines[i].ax, z: lines[i].az, h: lines[i].h, len: i < n - 1 ? lines[i].len : back });
    }

    let total = 0;
    pieces.forEach((p) => { total += p.len; });

    const points = [];
    const sections = [];
    let acc = 0;
    pieces.forEach((p) => {
      if (p.len < 3) { acc += p.len; return; }
      const steps = Math.max(p.kind === 'arc' ? 2 : 1, Math.ceil(p.len / (p.kind === 'arc' ? 14 : 25)));
      for (let k = 0; k < steps; k++) {
        const d = p.len * k / steps;
        let x, z;
        if (p.kind === 'line') { x = p.x + Math.sin(p.h) * d; z = p.z - Math.cos(p.h) * d; }
        else {
          const h = p.hIn + p.c.s * d / p.c.r;
          x = p.c.x - p.c.s * p.c.r * Math.cos(h); z = p.c.z - p.c.s * p.c.r * Math.sin(h);
        }
        points.push([round2(x), round2(z), round2(elevationAt(layout.elev, (acc + d) / total))]);
      }
      sections.push(p.kind === 'arc'
        ? { kind: 'bend', corner: p.corner, turn: p.c.s > 0 ? 'R' : 'L', r: p.c.r, deg: Math.round(p.sweep * 180 / Math.PI), from: acc / total, to: (acc + p.len) / total, len: p.len }
        : { kind: 'straight', from: acc / total, to: (acc + p.len) / total, len: p.len });
      acc += p.len;
    });
    return { points: points, sections: sections, length: total };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  function elevationAt(keys, f) {
    const n = keys ? keys.length : 0;
    if (!n) return 0;
    let i = n - 1;
    for (let k = 0; k < n; k++) if (keys[k][0] <= f) i = k;
    const a = keys[i], b = keys[(i + 1) % n];
    let span = b[0] - a[0]; if (span <= 0) span += 1;
    let t = f - a[0]; if (t < 0) t += 1;
    const u = Math.min(1, t / span);
    return a[1] + (b[1] - a[1]) * u * u * (3 - 2 * u);
  }

  const CUPS = [
    { id: 'sunshine', name: 'Sunshine Cup', emoji: '☀️', tracks: ['meadow', 'shores', 'candy', 'dunes'] },
    { id: 'moonlight', name: 'Moonlight Cup', emoji: '🌙', tracks: ['frost', 'spooky', 'lava', 'starlight'] },
    { id: 'wonder', name: 'Wonder Cup', emoji: '🎢', tracks: ['jungle', 'isles', 'reef', 'dino'] },
    { id: 'dream', name: 'Dream Cup', emoji: '💫', tracks: ['toybox', 'carnival', 'neon', 'factory'] }
  ];

  // Compact authoring helpers. Positions stay as lap fractions, so features
  // follow the same measured road as the renderer and race simulation.
  const allLanes = [0, 1, 2, 3, 4];
  const rows = (list) => list.map(([at, lanes]) => ({ at, lanes }));
  // A coin line's lane may be a path, [2, 3]: a run of coins in each lane in turn.
  const coins = (list) => list.map(([from, to, lane]) => ({ from, to, lane }));
  const hazards = (list) => list.map(([at, kind, lanes, period, phase]) => ({ at, kind, lanes, period: period || 0, phase: phase || 0 }));
  const edges = (list) => list.map(([from, to, left, right]) => ({ from, to, left, right }));
  const landmarks = (list) => list.map(([at, side, off, prop]) => ({ at, side, off, prop }));
  const features = (boxes, pads, boosts, coinLines, ramps, danger) => ({
    itemRows: boxes.map((at) => ({ at, lanes: allLanes.slice() })), padRows: rows(pads), boostPads: rows(boosts),
    coins: coins(coinLines), ramps: ramps.map(([at, kind, lanes, gap]) => (gap ? { at, kind, lanes, gap } : { at, kind, lanes })),
    hazards: hazards(danger)
  });

  const DEFS = {
    meadow: {
      name: 'Meadow Circuit', cup: 'sunshine', theme: 'meadow', seed: 1101, blurb: 'Rolling green hills, a hop over the babbling brook and a sunny farmyard finish.',
      opts: { bankGain: 8, bankMax: 0.16, scale: 1 },
      layout: { start: 100, corners: [[100, -75, 75, 'L'], [315, -138, 140, 'R'], [191, -290, 55, 'L'], [-4, -260, 140, 'R'], [-130, -60, 60, 'L']], elev: [[0, 0], [0.18, 2], [0.38, 6], [0.58, 2], [0.74, 4], [0.9, 0], [0.98, 0]] },
      edges: edges([[0.28, 0.48, 'verge', 'wall'], [0.665, 0.74, 'wall', 'wall'], [0.77, 0.88, 'wall', 'verge']]),
      features: features([0.055, 0.30, 0.62], [[0.175, [0, 1, 2]], [0.42, [1, 2, 3]], [0.74, [2, 3, 4]]],
        [[0.23, [1, 2]], [0.485, [0, 1]], [0.56, [3, 4]], [0.92, [2]]],
        [[0.075, 0.115, [1, 2]], [0.18, 0.22, [2, 1]], [0.32, 0.36, [0, 1]], [0.445, 0.495, [1, 0]], [0.55, 0.59, [3, 4]], [0.64, 0.68, [2, 1]], [0.765, 0.81, [1, 2]], [0.875, 0.915, [2, 1]]],
        [[0.69, 'jump', allLanes, 'creek']],
        [[0.12, 'block', [3, 4]], [0.365, 'puddle', [2, 3]], [0.53, 'roller', [0, 1], 7, 0.2], [0.83, 'block', [3, 4]]]),
      landmarks: landmarks([[0.13, 1, 75, 'hot_air_balloon'], [0.83, 1, 65, 'water_tower']])
    },
    shores: {
      name: 'Sandy Shores', cup: 'sunshine', theme: 'shores', seed: 1202, blurb: 'Race the surf, leap the sea arch inlet and sweep past the lighthouse.',
      opts: { bankGain: 9, bankMax: 0.18, scale: 1 },
      layout: { start: 100, corners: [[-75, -100, 75, 'L'], [-125, -225, 50, 'R'], [44, -205, 70, 'R'], [314, -165, 200, 'L'], [-40, 22, 200, 'R'], [80, 130, 80, 'R']], elev: [[0, 0], [0.18, 2], [0.33, 7], [0.45, 2], [0.66, 0], [0.8, 4], [0.93, 0], [0.98, 0]] },
      edges: edges([[0.19, 0.29, 'wall', 'verge'], [0.30, 0.32, 'verge', 'drop'], [0.32, 0.40, 'wall', 'wall'], [0.40, 0.42, 'verge', 'drop'], [0.62, 0.73, 'drop', 'verge'], [0.76, 0.89, 'verge', 'wall']]),
      features: features([0.06, 0.40, 0.69], [[0.165, [0, 1]], [0.505, [2, 3, 4]], [0.80, [1, 2, 3]]],
        [[0.23, [3, 4]], [0.575, [1, 2]], [0.645, [3]], [0.89, [2, 3]]],
        [[0.075, 0.115, [1, 2]], [0.19, 0.235, [3, 2]], [0.30, 0.336, [2, 3]], [0.425, 0.465, [3, 2]], [0.57, 0.615, [1, 2]], [0.665, 0.715, [3, 2]], [0.77, 0.81, [2, 3]], [0.865, 0.91, [4, 3]]],
        [[0.34, 'leap', allLanes, 'inlet']],
        [[0.125, 'block', [3, 4]], [0.285, 'roller', [0, 1], 6.5, 0.4], [0.545, 'puddle', [3, 4]], [0.745, 'block', [0]], [0.855, 'roller', [1, 2], 8, 0.1]]),
      landmarks: landmarks([[0.25, -1, 70, 'lighthouse'], [0.60, -1, 70, 'pier']])
    },
    candy: {
      name: 'Candy Canyon', cup: 'sunshine', theme: 'candy', seed: 1303, blurb: 'Drift through candy bends, then glide across the chocolate river canyon.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1 },
      layout: { start: 90, corners: [[-71, -160, 150, 'L'], [-3, -222, 60, 'L'], [-131, -265, 65, 'R'], [-239, -200, 60, 'L'], [-171, -138, 150, 'L'], [-129, 62, 70, 'L']], elev: [[0, 0], [0.18, 4], [0.40, 10], [0.57, 6], [0.70, 12], [0.84, 0], [0.95, 0]] },
      edges: edges([[0.20, 0.31, 'wall', 'verge'], [0.34, 0.52, 'verge', 'wall'], [0.64, 0.665, 'drop', 'drop'], [0.665, 0.785, 'wall', 'wall'], [0.785, 0.81, 'drop', 'drop']]),
      features: features([0.065, 0.325, 0.58], [[0.18, [0, 1, 2]], [0.44, [2, 3]], [0.79, [1, 2, 3]]],
        [[0.23, [0, 1]], [0.49, [0, 1]], [0.645, [2, 3]], [0.875, [0, 1]]],
        [[0.075, 0.115, [2, 3]], [0.205, 0.25, [1, 0]], [0.34, 0.38, [3, 4]], [0.46, 0.505, [1, 0]], [0.555, 0.60, [1, 2]], [0.635, 0.675, [2, 1]], [0.775, 0.816, [2, 3]], [0.87, 0.91, [1, 0]]],
        [[0.69, 'glide', allLanes, 'choco']],
        [[0.12, 'block', [4]], [0.38, 'roller', [0, 1], 7, 0.65], [0.54, 'puddle', [3, 4]], [0.84, 'block', [2]], [0.915, 'roller', [3, 4], 6, 0.25]]),
      landmarks: landmarks([[0.38, -1, 80, 'giant_cake'], [0.85, 1, 65, 'giant_cake']])
    },
    dunes: {
      name: 'Dusty Dunes', cup: 'sunshine', theme: 'dunes', seed: 1404, blurb: 'Sweep past pyramids and soar across the red rock canyon.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1 },
      layout: { start: 70, corners: [[70, 150, 150, 'R'], [148, 104, 65, 'R'], [314, 305, 180, 'L'], [-46, 325, 180, 'R'], [43, 411, 60, 'R'], [-125, 80, 80, 'R']], elev: [[0, 0], [0.18, 4], [0.35, 7], [0.55, 12], [0.69, 0], [0.83, 4], [0.95, 0]] },
      edges: edges([[0.14, 0.23, 'wall', 'verge'], [0.30, 0.43, 'verge', 'wall'], [0.50, 0.53, 'drop', 'drop'], [0.53, 0.64, 'wall', 'wall'], [0.64, 0.71, 'drop', 'drop'], [0.80, 0.90, 'wall', 'verge']]),
      features: features([0.06, 0.325, 0.715], [[0.17, [2, 3, 4]], [0.43, [1, 2]], [0.825, [2, 3, 4]]],
        [[0.225, [3]], [0.49, [3, 4]], [0.675, [1, 2]], [0.90, [2, 3]]],
        [[0.075, 0.115, [3, 4]], [0.155, 0.20, [3, 2]], [0.26, 0.305, [2, 3]], [0.35, 0.395, [3, 2]], [0.455, 0.495, [3, 4]], [0.50, 0.54, [2, 1]], [0.70, 0.745, [2, 3]], [0.82, 0.87, [3, 2]]],
        [[0.555, 'glide', allLanes, 'canyon']],
        [[0.12, 'block', [0, 1]], [0.28, 'roller', [3, 4], 7, 0.4], [0.385, 'puddle', [0, 1]], [0.765, 'block', [4]], [0.86, 'roller', [0, 1], 6.5, 0.2]]),
      landmarks: landmarks([[0.18, -1, 70, 'pyramid'], [0.48, -1, 55, 'cat_statue']])
    },
    frost: {
      name: 'Frosty Peaks', cup: 'moonlight', theme: 'frost', seed: 2101, blurb: 'Climb the snowy summit and glide over the glacier crevasse.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1 },
      layout: { start: 85, corners: [[85, -150, 150, 'L'], [287, 72, 150, 'R'], [337, -133, 55, 'L'], [187, -368, 180, 'R'], [17, -50, 180, 'L'], [-135, -160, 70, 'L'], [-125, -80, 80, 'L']], elev: [[0, 0], [0.18, 6], [0.36, 14], [0.50, 0], [0.68, 7], [0.84, 3], [0.96, 0]] },
      edges: edges([[0.22, 0.36, 'wall', 'drop'], [0.36, 0.47, 'wall', 'wall'], [0.47, 0.53, 'drop', 'drop'], [0.64, 0.77, 'wall', 'drop'], [0.82, 0.91, 'verge', 'wall']]),
      features: features([0.06, 0.315, 0.66], [[0.18, [1, 2, 3]], [0.53, [2, 3, 4]], [0.77, [0, 1, 2]]],
        [[0.235, [0, 1]], [0.49, [2, 3]], [0.60, [1, 2]], [0.89, [0, 1]]],
        [[0.075, 0.115, [2, 3]], [0.20, 0.245, [1, 0]], [0.29, 0.335, [1, 2]], [0.34, 0.375, [2, 1]], [0.51, 0.555, [3, 4]], [0.651, 0.693, [2, 1]], [0.71, 0.755, [1, 2]], [0.85, 0.895, [0, 1]]],
        [[0.385, 'glide', allLanes, 'crevasse'], [0.615, 'jump', [1, 2]]],
        [[0.12, 'block', [4]], [0.28, 'roller', [0, 1], 6, 0.15], [0.57, 'puddle', [0, 1]], [0.72, 'roller', [2, 3], 7, 0.4], [0.825, 'block', [2, 3]]]),
      landmarks: landmarks([[0.30, 1, 55, 'igloo'], [0.73, 1, 50, 'ice_arch']])
    },
    spooky: {
      name: 'Spooky Woods', cup: 'moonlight', theme: 'spooky', seed: 2202, blurb: 'Follow the lanterns past friendly ghosts, then hop the misty bog ravine.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1 },
      layout: { start: 70, corners: [[-150, -70, 150, 'L'], [116, -210, 150, 'R'], [-99, -240, 65, 'L'], [-189, -230, 60, 'L'], [-399, -200, 150, 'R'], [-152, -28, 150, 'L'], [-399, 144, 150, 'R'], [-179, 176, 70, 'L'], [-90, 140, 90, 'L']], elev: [[0, 0], [0.18, 5], [0.36, 1], [0.50, 6], [0.70, 2], [0.85, 3], [0.94, 0]] },
      edges: edges([[0.17, 0.25, 'wall', 'verge'], [0.31, 0.38, 'verge', 'wall'], [0.46, 0.58, 'drop', 'drop'], [0.67, 0.76, 'wall', 'verge'], [0.895, 0.965, 'wall', 'wall']]),
      features: features([0.055, 0.33, 0.65], [[0.165, [2, 3, 4]], [0.445, [0, 1, 2]], [0.76, [2, 3]]],
        [[0.23, [0, 1]], [0.50, [1, 2]], [0.60, [3, 4]], [0.87, [0, 1]]],
        [[0.065, 0.105, [2, 3]], [0.19, 0.235, [1, 0]], [0.265, 0.31, [3, 4]], [0.345, 0.395, [1, 0]], [0.47, 0.515, [2, 3]], [0.61, 0.655, [3, 2]], [0.735, 0.785, [1, 2]], [0.85, 0.90, [0, 1]]],
        [[0.92, 'jump', allLanes, 'ravine']],
        [[0.115, 'block', [3, 4]], [0.285, 'roller', [0, 1], 6.5, 0.7], [0.39, 'puddle', [3, 4]], [0.555, 'roller', [2, 3], 8, 0.15], [0.705, 'block', [0, 1]], [0.82, 'puddle', [1, 2]]]),
      landmarks: landmarks([[0.21, 1, 60, 'haunted_house'], [0.71, 1, 55, 'bell_tower']])
    },
    lava: {
      name: 'Lava Castle', cup: 'moonlight', theme: 'lava', seed: 2303, blurb: 'Cross the fortress bridges and glide over the bubbling lava moat.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1 },
      layout: { start: 60, corners: [[60, 70, 70, 'R'], [-20, 140, 150, 'R'], [217, 324, 150, 'L'], [2, 364, 65, 'R'], [-205, 369, 60, 'R'], [-125, 140, 140, 'R']], elev: [[0, 0], [0.20, 6], [0.40, 14], [0.53, 0], [0.70, 8], [0.86, 2], [0.95, 0]] },
      edges: edges([[0, 0.15, 'wall', 'wall'], [0.15, 0.31, 'drop', 'wall'], [0.31, 0.395, 'wall', 'drop'], [0.395, 0.50, 'wall', 'wall'], [0.50, 0.54, 'drop', 'drop'], [0.54, 0.62, 'wall', 'wall'], [0.62, 0.77, 'drop', 'drop'], [0.77, 1, 'wall', 'wall']]),
      features: features([0.055, 0.345, 0.68], [[0.17, [2, 3, 4]], [0.55, [1, 2]], [0.79, [2, 3, 4]]],
        [[0.24, [0, 1]], [0.515, [2, 3]], [0.615, [3, 4]], [0.90, [1, 2]]],
        [[0.065, 0.105, [3, 4]], [0.19, 0.235, [2, 1]], [0.275, 0.32, [1, 2]], [0.35, 0.395, [3, 2]], [0.493, 0.535, [2, 3]], [0.565, 0.61, [3, 2]], [0.69, 0.735, [4, 3]], [0.865, 0.91, [2, 1]]],
        [[0.415, 'glide', allLanes, 'moat']],
        [[0.105, 'block', [0, 1]], [0.285, 'geyser', [3, 4], 6, 0.2], [0.38, 'roller', [0, 1], 7, 0.55], [0.585, 'geyser', [0, 1], 5.5, 0.6], [0.735, 'puddle', [1, 2]], [0.84, 'block', [3, 4]]]),
      landmarks: landmarks([[0.365, -1, 65, 'castle_gate'], [0.57, -1, 90, 'volcano']])
    },
    starlight: {
      name: 'Starlight Road', cup: 'moonlight', theme: 'starlight', seed: 2404, blurb: 'A rainbow ribbon through the stars, with a leap through the giant star ring.',
      opts: { bankGain: 12, bankMax: 0.26, scale: 1 },
      layout: { start: 80, corners: [[80, -180, 180, 'L'], [165, -152, 100, 'L'], [210, -303, 55, 'L'], [-59, -368, 220, 'R'], [-206, -88, 60, 'L'], [-130, -160, 160, 'L']], elev: [[0, 0], [0.16, 5], [0.31, -4], [0.46, 6], [0.62, 14], [0.76, -1], [0.91, 5], [0.99, 0]] },
      edges: edges([[0, 0.05, 'wall', 'wall'], [0.05, 0.62, 'drop', 'drop'], [0.62, 0.725, 'wall', 'wall'], [0.725, 0.92, 'drop', 'drop'], [0.92, 1, 'wall', 'wall']]),
      features: features([0.06, 0.335, 0.56], [[0.17, [0, 1, 2]], [0.45, [2, 3, 4]], [0.79, [1, 2, 3]]],
        [[0.24, [1, 2]], [0.505, [3, 4]], [0.605, [1, 2]], [0.90, [2, 3]]],
        [[0.075, 0.12, [1, 2]], [0.185, 0.225, [1, 0]], [0.27, 0.315, [3, 4]], [0.35, 0.395, [1, 0]], [0.46, 0.505, [3, 4]], [0.575, 0.625, [2, 1]], [0.717, 0.757, [2, 3]], [0.79, 0.835, [1, 0]]],
        [[0.64, 'glide', allLanes, 'void']],
        [[0.115, 'geyser', [3, 4], 6, 0.1], [0.29, 'roller', [0, 1], 6.5, 0.45], [0.395, 'block', [3, 4]], [0.535, 'puddle', [0, 1]], [0.755, 'block', [0, 1]], [0.845, 'geyser', [3, 4], 5, 0.6]]),
      landmarks: landmarks([[0.38, 1, 100, 'space_station'], [0.79, 1, 120, 'moon_big']])
    },
    jungle: {
      name: 'Jungle Falls', cup: 'wonder', theme: 'jungle', seed: 3101,
      blurb: 'Burst through the temple waterfall, loop the loop and glide over the river gorge.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.50, 0.59, 0.62], [0.635, 0.705, 0.6]] },
      layout: { start: 60, corners: [[-70, -75, 135, 'L'], [-150, 90, 55, 'L'], [60, 95, 52, 'L'], [45, -15, 48, 'R'], [140, -150, 55, 'L']],
        elev: [[0, 0], [0.12, 2], [0.18, 3], [0.285, 3], [0.37, 13], [0.39, 13], [0.47, 4], [0.62, 3], [0.72, 6], [0.86, 3], [0.95, 0]] },
      edges: edges([[0.085, 0.12, 'wall', 'wall'], [0.19, 0.28, 'wall', 'wall'], [0.36, 0.475, 'wall', 'wall'], [0.495, 0.60, 'verge', 'wall'],
        [0.62, 0.71, 'wall', 'verge'], [0.73, 0.785, 'drop', 'verge']]),
      features: features([0.055, 0.365, 0.72], [[0.285, [1, 2, 3]], [0.575, [0, 1, 2]], [0.86, [2, 3, 4]]],
        [[0.18, [3, 4]], [0.47, [1, 2]], [0.76, [2, 3]], [0.90, [1, 2]]],
        [[0.065, 0.098, [2, 3]], [0.32, 0.355, [1, 0]], [0.475, 0.52, [3, 4]], [0.64, 0.68, [2, 1]], [0.80, 0.84, [1, 2]], [0.905, 0.938, [3, 2]]],
        [[0.385, 'glide', allLanes, 'gorge']],
        [[0.15, 'roller', [0, 1], 7, 0.3], [0.31, 'block', [3, 4]], [0.535, 'puddle', [3, 4]], [0.61, 'geyser', [1, 2], 6, 0.2], [0.79, 'roller', [3, 4], 7, 0.6]]),
      pieces: [{ kind: 'falls', at: 0.10 }, { kind: 'loop', at: 0.205, side: 1 }],
      landmarks: landmarks([[0.16, -1, 75, 'temple_big'], [0.66, -1, 70, 'stone_head']])
    },
    isles: {
      name: 'Floating Isles', cup: 'wonder', theme: 'isles', seed: 3202,
      blurb: 'Loop the loop on a sky bridge, then glide between islands through a waterfall.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.29, 0.36, 0.5], [0.69, 0.79, 0.62]] },
      layout: { start: 70, corners: [[-140, -55, 58, 'L'], [-80, 150, 65, 'L'], [115, 100, 135, 'L'], [230, -15, 58, 'L'], [85, -55, 48, 'R']],
        elev: [[0, 0], [0.15, 0], [0.30, 0], [0.42, 4], [0.54, 13], [0.605, 14], [0.71, 4], [0.79, 5], [0.87, 1], [0.95, 0]] },
      edges: edges([[0.14, 0.29, 'wall', 'wall'], [0.29, 0.345, 'verge', 'wall'], [0.345, 0.43, 'wall', 'wall'], [0.47, 0.585, 'verge', 'drop'],
        [0.59, 0.70, 'wall', 'wall'], [0.70, 0.80, 'verge', 'wall'], [0.80, 0.865, 'drop', 'wall']]),
      features: features([0.06, 0.42, 0.74], [[0.25, [1, 2, 3]], [0.55, [2, 3, 4]], [0.885, [0, 1, 2]]],
        [[0.13, [1, 2]], [0.33, [3, 4]], [0.70, [2, 3]], [0.94, [1, 2]]],
        [[0.07, 0.105, [2, 3]], [0.235, 0.27, [0, 1]], [0.42, 0.46, [3, 4]], [0.50, 0.54, [1, 0]], [0.715, 0.75, [2, 3]], [0.79, 0.83, [3, 2]], [0.90, 0.936, [1, 2]]],
        [[0.365, 'leap', allLanes, 'sky'], [0.612, 'glide', allLanes, 'sky']],
        [[0.10, 'roller', [3, 4], 7, 0.15], [0.30, 'block', [0, 1]], [0.47, 'puddle', [3, 4]], [0.53, 'geyser', [0, 1], 6, 0.5],
          [0.78, 'roller', [1, 2], 7.5, 0.35], [0.92, 'block', [3]]]),
      pieces: [{ kind: 'loop', at: 0.165, side: 1 }, { kind: 'falls', at: 0.649, air: true }],
      islands: [[0.86, 0.15], [0.285, 0.80]],
      landmarks: landmarks([[0.25, -1, 130, 'sky_whale'], [0.65, 1, 160, 'sky_castle']])
    },
    reef: {
      name: 'Coral Reef', cup: 'wonder', theme: 'reef', seed: 3303,
      blurb: 'Loop the loop on the sea floor, race through coral rings and glide over the glowing trench.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.36, 0.43, 0.55], [0.448, 0.53, 0.6]] },
      layout: { start: 70, corners: [[-160, -123, 50, 'L'], [-156, 28, 47, 'L'], [-13, 69, 50, 'R'], [54, 146, 51, 'L'], [136, 16, 69, 'L'], [91, -34, 135, 'L']],
        elev: [[0, 0], [0.10, 2], [0.20, 2], [0.34, 6], [0.45, 8], [0.575, 13], [0.59, 13], [0.70, 4], [0.80, 3], [0.95, 0]] },
      edges: edges([[0.105, 0.20, 'wall', 'wall'], [0.27, 0.345, 'wall', 'wall'], [0.555, 0.665, 'wall', 'wall'], [0.77, 0.83, 'wall', 'wall']]),
      features: features([0.05, 0.36, 0.70], [[0.215, [1, 2, 3]], [0.47, [0, 1, 2]], [0.86, [2, 3, 4]]],
        [[0.25, [0, 1]], [0.42, [3, 4]], [0.555, [1, 2]], [0.90, [2, 3]]],
        [[0.035, 0.075, [2, 3]], [0.205, 0.24, [3, 2]], [0.29, 0.33, [2, 3]], [0.44, 0.48, [1, 0]], [0.52, 0.553, [3, 4]], [0.67, 0.71, [2, 1]], [0.74, 0.78, [1, 2]], [0.83, 0.87, [1, 0]]],
        [[0.575, 'glide', allLanes, 'trench']],
        [[0.10, 'roller', [3, 4], 7, 0.3], [0.31, 'puddle', [0, 1]], [0.40, 'geyser', [2, 3], 6, 0.4], [0.50, 'block', [3, 4]],
          [0.74, 'roller', [0, 1], 7, 0.6], [0.84, 'puddle', [3, 4]], [0.92, 'block', [0, 1]]]),
      pieces: [{ kind: 'loop', at: 0.123, side: 1 }, { kind: 'arches', at: 0.28, prop: 'coral_ring', count: 5, spacing: 14 },
        { kind: 'falls', at: 0.80, style: 'bubbles', gate: 'coral_gate' }],
      landmarks: landmarks([[0.15, 1, 85, 'treasure_galleon'], [0.75, 1, 90, 'giant_turtle']])
    },
    dino: {
      name: 'Dino Valley', cup: 'wonder', theme: 'dino', seed: 3404,
      blurb: 'Leap the bubbling tar pit, drive through a giant ribcage and glide over the dinosaur river.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.205, 0.29, 0.55], [0.339, 0.436, 0.62], [0.46, 0.52, 0.5]] },
      layout: { start: 70, corners: [[119, -79, 61, 'R'], [153, 47, 60, 'R'], [30, 63, 47, 'L'], [-42, 131, 50, 'R'], [-110, -43, 138, 'R']],
        elev: [[0, 0], [0.09, 1], [0.18, 1], [0.30, 5], [0.44, 9], [0.556, 14], [0.565, 14], [0.67, 4], [0.80, 2], [0.95, 0]] },
      edges: edges([[0.10, 0.18, 'wall', 'wall'], [0.30, 0.34, 'verge', 'wall'], [0.535, 0.645, 'wall', 'wall'], [0.70, 0.78, 'wall', 'verge']]),
      features: features([0.06, 0.36, 0.70], [[0.24, [1, 2, 3]], [0.49, [2, 3, 4]], [0.85, [0, 1, 2]]],
        [[0.10, [2]], [0.20, [3, 4]], [0.53, [1, 2]], [0.75, [2, 3]], [0.92, [1, 2]]],
        [[0.035, 0.075, [2, 3]], [0.185, 0.225, [1, 0]], [0.27, 0.31, [1, 2]], [0.37, 0.41, [2, 3]], [0.45, 0.49, [1, 2]], [0.64, 0.68, [2, 1]], [0.72, 0.76, [1, 2]], [0.80, 0.84, [3, 2]], [0.88, 0.92, [2, 3]]],
        [[0.118, 'leap', allLanes, 'tarpit'], [0.556, 'glide', allLanes, 'dinoriver']],
        [[0.21, 'roller', [0, 1], 7, 0.2], [0.29, 'puddle', [3, 4]], [0.41, 'block', [0, 1]], [0.665, 'geyser', [2, 3], 6, 0.4],
          [0.77, 'roller', [3, 4], 7.5, 0.5], [0.87, 'puddle', [3, 4]]]),
      pieces: [{ kind: 'arches', at: 0.80, prop: 'rib_arch', count: 5, spacing: 13 }],
      landmarks: landmarks([[0.25, -1, 85, 'long_neck'], [0.72, -1, 80, 'triceratops_big']])
    },
    toybox: {
      name: 'Toy Room', cup: 'dream', theme: 'toybox', seed: 4101,
      blurb: 'Race a giant playroom: loop the loop, leap the ball pit and burst through the bubble machine.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.076, 0.182, 0.6], [0.222, 0.323, 0.62]] },
      layout: { start: 70, corners: [[-106, 47, 138, 'L'], [-187, 17, 53, 'L'], [-71, 37, 49, 'R'], [-1, 104, 47, 'L'], [129, 4, 66, 'L'], [54, -127, 140, 'L']],
        elev: [[0, 0], [0.07, 0], [0.20, 4], [0.33, 6], [0.43, 5], [0.51, 5], [0.585, 8], [0.65, 8], [0.80, 3], [0.95, 0]] },
      edges: edges([[0.20, 0.32, 'drop', 'verge'], [0.435, 0.505, 'wall', 'wall'], [0.575, 0.66, 'wall', 'wall'], [0.69, 0.74, 'verge', 'drop'], [0.745, 0.775, 'wall', 'wall']]),
      features: features([0.055, 0.35, 0.69], [[0.20, [1, 2, 3]], [0.53, [0, 1, 2]], [0.85, [2, 3, 4]]],
        [[0.25, [3, 4]], [0.415, [2]], [0.575, [1, 2]], [0.80, [1, 2]], [0.92, [2, 3]]],
        [[0.035, 0.075, [2, 3]], [0.10, 0.14, [1, 0]], [0.22, 0.26, [2, 3]], [0.29, 0.33, [3, 2]], [0.36, 0.40, [1, 2]], [0.52, 0.56, [2, 1]], [0.66, 0.70, [3, 4]], [0.78, 0.82, [2, 1]], [0.86, 0.90, [3, 4]]],
        [[0.595, 'leap', allLanes, 'ballpit']],
        [[0.12, 'roller', [3, 4], 7, 0.25], [0.28, 'puddle', [0, 1]], [0.39, 'block', [3, 4]], [0.67, 'geyser', [0, 1], 6, 0.3],
          [0.73, 'roller', [2, 3], 7, 0.6], [0.82, 'puddle', [3, 4]], [0.90, 'block', [0, 1]]]),
      pieces: [{ kind: 'loop', at: 0.44, side: 1 }, { kind: 'falls', at: 0.76, style: 'bubbles', gate: 'bubble_machine_gate' },
        { kind: 'arches', at: 0.895, prop: 'toy_arch', count: 4, spacing: 16 }],
      landmarks: landmarks([[0.15, 1, 80, 'teddy_giant'], [0.62, 1, 90, 'toy_rocket_big']])
    },
    carnival: {
      name: 'Funfair', cup: 'dream', theme: 'carnival', seed: 4202,
      blurb: 'Bank round the big wheel, loop the loop, then fly over the bumper cars.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.041, 0.188, 0.55], [0.409, 0.54, 0.6], [0.778, 0.842, 0.62]] },
      layout: { start: 60, corners: [[-147, -72, 68, 'R'], [3, -52, 51, 'L'], [169, -98, 67, 'R'], [-2, 183, 48, 'R']],
        elev: [[0, 0], [0.10, 3], [0.25, 7], [0.40, 6], [0.56, 5], [0.74, 5], [0.85, 3], [0.95, 0]] },
      edges: edges([[0.205, 0.235, 'wall', 'wall'], [0.30, 0.33, 'drop', 'verge'], [0.565, 0.74, 'wall', 'wall']]),
      features: features([0.06, 0.34, 0.75], [[0.18, [2, 3, 4]], [0.47, [0, 1, 2]], [0.87, [1, 2, 3]]],
        [[0.27, [1, 2]], [0.40, [3, 4]], [0.55, [2]], [0.655, [1, 2, 3]], [0.93, [2, 3]]],
        [[0.035, 0.075, [2, 3]], [0.10, 0.14, [1, 0]], [0.25, 0.29, [3, 4]], [0.36, 0.40, [2, 1]], [0.44, 0.48, [3, 4]], [0.52, 0.555, [1, 0]], [0.73, 0.77, [2, 3]], [0.80, 0.84, [1, 0]], [0.89, 0.93, [1, 2]]],
        [[0.673, 'leap', allLanes, 'bumpercars']],
        [[0.12, 'roller', [3, 4], 7, 0.3], [0.30, 'puddle', [0, 1]], [0.42, 'block', [0, 1]], [0.79, 'roller', [2, 3], 7, 0.5],
          [0.83, 'geyser', [0, 1], 6, 0.6], [0.91, 'puddle', [3, 4]]]),
      pieces: [{ kind: 'falls', at: 0.22, style: 'confetti', gate: 'balloon_gate' }, { kind: 'loop', at: 0.575, side: -1 },
        { kind: 'arches', at: 0.88, prop: 'light_arch', count: 4, spacing: 16 }],
      landmarks: landmarks([[0.66, 1, 100, 'ferris_giant'], [0.12, -1, 80, 'drop_tower']])
    },
    neon: {
      name: 'Neon City', cup: 'dream', theme: 'neon', seed: 4303,
      blurb: 'Glide over the busy street, race through glowing hoops and loop the loop in the skyline.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.05, 0.105, 0.55], [0.391, 0.431, 0.58], [0.462, 0.535, 0.6]] },
      layout: { start: 70, corners: [[-176, -135, 53, 'L'], [-39, 10, 136, 'L'], [26, 187, 47, 'R'], [136, 187, 53, 'L'], [203, 84, 62, 'L'], [59, -49, 137, 'L']],
        elev: [[0, 0], [0.04, 1], [0.12, 8], [0.135, 8], [0.24, -2], [0.36, -2], [0.45, 4], [0.55, 6], [0.62, 3], [0.68, 2], [0.77, 2], [0.90, 0]] },
      edges: edges([[0.11, 0.215, 'wall', 'wall'], [0.255, 0.32, 'wall', 'wall'], [0.565, 0.595, 'wall', 'wall'], [0.685, 0.76, 'wall', 'wall']]),
      features: features([0.06, 0.40, 0.78], [[0.22, [1, 2, 3]], [0.53, [2, 3, 4]], [0.92, [0, 1, 2]]],
        [[0.10, [1, 2]], [0.33, [0, 1]], [0.47, [3, 4]], [0.66, [2]], [0.85, [1, 2]]],
        [[0.035, 0.075, [2, 3]], [0.21, 0.25, [3, 2]], [0.27, 0.31, [1, 2]], [0.36, 0.40, [2, 1]], [0.44, 0.48, [3, 4]], [0.60, 0.64, [3, 2]], [0.79, 0.83, [2, 3]], [0.87, 0.91, [1, 0]]],
        [[0.13, 'glide', allLanes, 'street']],
        [[0.25, 'roller', [3, 4], 7, 0.4], [0.36, 'block', [0, 1]], [0.46, 'puddle', [0, 1]], [0.62, 'geyser', [1, 2], 6, 0.2],
          [0.81, 'roller', [3, 4], 7.5, 0.6], [0.885, 'puddle', [3, 4]]]),
      pieces: [{ kind: 'arches', at: 0.26, prop: 'neon_hoop', count: 6, spacing: 13 }, { kind: 'falls', at: 0.58, style: 'hologram', gate: 'holo_gate' },
        { kind: 'loop', at: 0.6927, side: 1 }],
      landmarks: landmarks([[0.20, 1, 90, 'neon_tower'], [0.70, 1, 85, 'giant_cat_sign']])
    },
    factory: {
      name: 'Clockwork Factory', cup: 'dream', theme: 'factory', seed: 4404,
      blurb: 'Bank round the gear hairpins, loop the loop and glide over the clanking gear pit.',
      opts: { bankGain: 10, bankMax: 0.2, scale: 1, banks: [[0.047, 0.171, 0.65], [0.46, 0.55, 0.62]] },
      layout: { start: 70, corners: [[-75, -112, 52, 'L'], [29, -52, 53, 'R'], [-60, 157, 49, 'L'], [31, -76, 139, 'L'], [141, -141, 55, 'L']],
        elev: [[0, 0], [0.17, 4], [0.21, 4], [0.33, 6], [0.42, 6], [0.585, 12], [0.595, 12], [0.70, 2], [0.80, 1], [0.95, 0]] },
      edges: edges([[0.22, 0.30, 'drop', 'verge'], [0.345, 0.415, 'wall', 'wall'], [0.565, 0.67, 'wall', 'wall'], [0.785, 0.815, 'wall', 'wall']]),
      features: features([0.06, 0.30, 0.68], [[0.20, [1, 2, 3]], [0.47, [2, 3, 4]], [0.86, [0, 1, 2]]],
        [[0.13, [3, 4]], [0.33, [1, 2, 3]], [0.565, [1, 2]], [0.74, [2, 3]], [0.93, [1, 2]]],
        [[0.035, 0.075, [2, 3]], [0.10, 0.14, [1, 0]], [0.22, 0.26, [3, 4]], [0.43, 0.47, [1, 0]], [0.50, 0.54, [3, 4]], [0.67, 0.71, [2, 1]], [0.72, 0.76, [1, 2]], [0.83, 0.87, [3, 2]], [0.89, 0.93, [2, 3]]],
        [[0.585, 'glide', allLanes, 'gearpit']],
        [[0.16, 'roller', [0, 1], 7, 0.2], [0.25, 'puddle', [0, 1]], [0.44, 'block', [3, 4]], [0.53, 'geyser', [0, 1], 6, 0.5],
          [0.71, 'roller', [3, 4], 7, 0.4], [0.775, 'block', [0, 1]], [0.89, 'puddle', [3, 4]]]),
      pieces: [{ kind: 'loop', at: 0.3511, side: 1 }, { kind: 'arches', at: 0.725, prop: 'pipe_arch', count: 4, spacing: 15 },
        { kind: 'falls', at: 0.80, style: 'steam', gate: 'steam_gate' }],
      landmarks: landmarks([[0.38, 1, 80, 'clock_tower'], [0.62, 1, 90, 'gear_tower']])
    }
  };

  const TRACKS = {};
  Object.keys(DEFS).forEach((id) => {
    const d = DEFS[id];
    const built = buildLayout(d.layout);
    // Every ramp earns its place: its arc clears a visible themed obstacle.
    // Keep the link in data so drawing, collisions, guidance and validation
    // agree about the safe jump, including Mirror mode. `at` is useful to
    // layout tools; the world resolves the exact metre offset from rampAt.
    d.features.ramps.forEach((ramp) => {
      const jump = NK.C.JUMPS[ramp.kind];
      ramp.flightLength = jump.flightLength;
      ramp.peakHeight = jump.peakHeight;
      // A landscape gap is the thing the jump clears: no block on the road.
      if (ramp.gap) return;
      const offset = jump.rampLength + jump.flightLength / 2;
      d.features.hazards.push({ at: (ramp.at + offset / built.length) % 1,
        kind: 'block', lanes: ramp.lanes.slice(), period: 0, phase: 0,
        jumpObstacle: true, rampAt: ramp.at, rampOffset: offset });
    });
    TRACKS[id] = Object.assign({ id: id, laps: 3 }, d, { points: built.points });
  });

  function get(id, opts) {
    let src = TRACKS[id];
    if (!src) { console.warn('NK.tracks.get: unknown track "' + id + '", using ' + CUPS[0].tracks[0]); src = TRACKS[CUPS[0].tracks[0]]; }
    const t = JSON.parse(JSON.stringify(src));
    t.mirror = !!(opts && opts.mirror);
    if (t.mirror) {
      const flip = (lane) => NK.C.mirrorLane(lane);
      ['itemRows', 'padRows', 'boostPads', 'ramps', 'hazards'].forEach((kind) => {
        t.features[kind].forEach((row) => { row.lanes = row.lanes.map(flip).sort((a, b) => a - b); });
      });
      t.features.coins.forEach((line) => { line.lane = Array.isArray(line.lane) ? line.lane.map(flip) : flip(line.lane); });
      t.edges.forEach((edge) => { const left = edge.left; edge.left = edge.right; edge.right = left; });
      t.landmarks.forEach((mark) => { mark.side = -mark.side; });
      (t.pieces || []).forEach((piece) => { if (piece.side) piece.side = -piece.side; });
      // The spline reflects the points itself from t.mirror. Reflecting them
      // here as well would silently cancel Mirror mode's road geometry.
    }
    return t;
  }

  return { CUPS: CUPS, TRACKS: TRACKS, get: get, buildLayout: buildLayout };
})();
