/**
 * NARBE Racer — circuit analysis shared by tools/validate_tracks.js (node) and
 * tools/track_preview.html (browser). Dev-only: the website build drops tools/.
 *
 * One function, analyse(), builds a track's loop with NKSpline and checks it
 * against every layout and feature rule of DESIGN.md §9.3–9.4 and §10.3, plus
 * the track-design brief (lap length, drift bends, slopes, feature spacing).
 * Keeping the rules here means the preview shows exactly the verdict the
 * validator prints.
 *
 * Positions in track data are lap fractions; everything below works in metres
 * (s = fraction × L) because every rule is written in metres.
 */
(function (root) {
  'use strict';

  /* ── DESIGN.md §9.4 prop catalog — the contract with themes.js ───────── */
  const CATALOG = {
    meadow: {
      near: ['tree_round', 'tree_pine', 'bush', 'flower_patch', 'fence_wood', 'hay_bale', 'rock_small', 'toadstool'],
      far: ['windmill', 'barn', 'silo', 'hill_round', 'tree_cluster'],
      landmarks: ['hot_air_balloon', 'water_tower'],
      hazards: { block: 'hay_stack', roller: 'hay_roll', geyser: null, puddle: 'mud_puddle' }
    },
    shores: {
      near: ['palm_tree', 'beach_umbrella', 'sand_castle', 'beach_ball', 'rock_sand', 'seashell', 'surf_stand', 'beach_grass'],
      far: ['lighthouse', 'beach_hut', 'sailboat', 'sea_rock', 'pier'],
      landmarks: ['lighthouse', 'pier'],
      hazards: { block: 'castle_big', roller: 'crab', geyser: null, puddle: 'tide_pool' }
    },
    candy: {
      near: ['lollipop_tree', 'candy_cane', 'gumdrop', 'cupcake', 'donut', 'ice_cream', 'wafer_fence'],
      far: ['cake_mountain', 'cookie_house', 'choco_fountain', 'candy_hill'],
      landmarks: ['giant_cake'],
      hazards: { block: 'cupcake_big', roller: 'gumball', geyser: null, puddle: 'choco_puddle' }
    },
    dunes: {
      near: ['cactus', 'cactus_barrel', 'rock_desert', 'dry_shrub', 'desert_sign', 'bones'],
      far: ['mesa', 'pyramid', 'oasis_palm', 'dune_hill'],
      landmarks: ['pyramid', 'cat_statue'],
      hazards: { block: 'boulder_desert', roller: 'tumbleweed', geyser: null, puddle: 'quicksand' }
    },
    frost: {
      near: ['pine_snowy', 'snowman', 'ice_crystal', 'snow_rock', 'snow_drift', 'lamp_snowy'],
      far: ['snowy_mountain', 'cabin', 'ski_tower', 'pine_cluster_snowy'],
      landmarks: ['igloo', 'ice_arch'],
      hazards: { block: 'snowman_big', roller: 'snowball', geyser: null, puddle: 'ice_patch' }
    },
    spooky: {
      near: ['dead_tree', 'pumpkin', 'gravestone', 'lantern_post', 'glow_mushroom', 'iron_fence'],
      far: ['haunted_house', 'spooky_hill', 'dead_tree_big'],
      landmarks: ['haunted_house', 'bell_tower'],
      hazards: { block: 'pumpkin_big', roller: 'ghost', geyser: null, puddle: 'goo_puddle' }
    },
    lava: {
      near: ['lava_rock', 'torch_pillar', 'spike_rock', 'chain_post', 'skull_rock'],
      far: ['volcano', 'castle_tower', 'castle_wall_piece', 'rock_spire'],
      landmarks: ['castle_gate', 'volcano'],
      hazards: { block: 'stone_block', roller: 'rolling_boulder', geyser: 'lava_geyser', puddle: 'ash_puddle' }
    },
    starlight: {
      near: ['star_buoy', 'asteroid_small', 'crystal_spire', 'ring_gate', 'light_pylon'],
      far: ['planet_ringed', 'planet', 'space_station', 'comet'],
      landmarks: ['space_station', 'moon_big'],
      hazards: { block: 'space_rock', roller: 'meteor', geyser: 'plasma_vent', puddle: 'gravity_well' }
    }
  };

  const CUPS = [
    { id: 'sunshine', tracks: ['meadow', 'shores', 'candy', 'dunes'] },
    { id: 'moonlight', tracks: ['frost', 'spooky', 'lava', 'starlight'] }
  ];

  /* ── The rules, in metres ─────────────────────────────────────────────── */
  const RULES = {
    lap: [1000, 1500],
    minRadius: 42,            // hard floor (DESIGN §10.3)
    designRadius: 45,         // what the layouts aim for
    clearance: 34,            // centre-to-centre gap between separate stretches
    startWindow: [-110, 40],  // straight road either side of the line
    maxSlope: 0.12,
    maxAbsY: 16,
    straightK: 0.004,         // |k| below this is "straight" (radius > 250 m)
    bendK: 1 / 300,           // |k| above this is a bend worth naming
    longStraight: 200,
    drifts: [2, 4],           // proper drift bends per lap
    driftRadius: [45, 110],
    driftMinLen: 35,          // shorter drift regions just flicker the sparks
    borderline: [110, 128],   // radii that sit on the drift threshold: avoid
    lineClear: 40,            // nothing this close after the line…
    gridZone: 80,             // …or on the grid behind it
    itemRows: [3, 4], padRows: [3, 4], boostPads: [4, 8], coins: [6, 10], ramps: [1, 3], hazards: [3, 8],
    coinLen: [40, 120],
    padAfterBox: 120,
    hazardGap: 25,            // hazards to box/pad rows and ramps
    rowGap: 20,               // any two row features
    jumpLanding: 60,
    glideLanding: 130,
    glideDrop: 5,             // metres the road must fall over the glide's flight
    landmarkClear: 24         // landmark origin to the nearest road centreline
  };

  const EDGE_KINDS = ['wall', 'verge', 'drop'];
  const HAZARD_KINDS = ['block', 'roller', 'geyser', 'puddle'];
  const ROAD_STYLES = ['asphalt', 'rainbow', 'ice', 'candy', 'stone', 'sand'];
  const LIQUIDS = ['water', 'lava', 'chocolate', 'void'];
  const AMBIENTS = ['leaves', 'petals', 'snow', 'embers', 'stars', null];
  const HEX = /^#[0-9a-f]{6}$/i;

  const mod = (a, n) => { const r = a % n; return r < 0 ? r + n : r; };
  /** Metres from a to b going forward round the lap. */
  const ahead = (a, b, L) => mod(b - a, L);
  /** Shortest distance between two positions on the lap. */
  const gap = (a, b, L) => { const d = ahead(a, b, L); return Math.min(d, L - d); };

  /* ── Curvature regions ────────────────────────────────────────────────── */

  /** Contiguous node runs where test(k) holds, merged across gaps < mergeGap
   *  metres (bends only merge while they keep turning the same way — pass
   *  signed=false for straights, whose curvature noise flips sign freely).
   *  Returned in lap order. */
  function regions(loop, test, mergeGap, signed) {
    const N = loop.N, seg = loop.seg, nodes = loop.nodes;
    let startAt = 0;
    while (startAt < N && test(nodes[startAt].k)) startAt++;      // begin outside a region
    if (startAt === N) return [{ from: 0, to: loop.L, len: loop.L, sign: Math.sign(nodes[0].k), minR: 1 / Math.max(1e-9, Math.max.apply(null, nodes.map((n) => Math.abs(n.k)))), turn: 0 }];
    const out = [];
    let cur = null;
    for (let q = 1; q <= N; q++) {
      const i = (startAt + q) % N, nd = nodes[i];
      if (test(nd.k)) {
        const sg = signed === false ? 0 : Math.sign(nd.k);
        if (cur && sg === cur.sign && (q - cur.lastQ) * seg <= mergeGap + seg) {
          cur.lastQ = q; cur.maxK = Math.max(cur.maxK, Math.abs(nd.k)); cur.turn += nd.k * seg;
        } else {
          if (cur) out.push(cur);
          cur = { firstQ: q, lastQ: q, sign: sg, maxK: Math.abs(nd.k), turn: nd.k * seg };
        }
      }
    }
    if (cur) out.push(cur);
    return out.map((r) => {
      const from = mod((startAt + r.firstQ) * seg, loop.L);
      const len = (r.lastQ - r.firstQ + 1) * seg;
      return { from: from, to: mod(from + len, loop.L), len: len, sign: r.sign, minR: 1 / r.maxK, turn: r.turn * 180 / Math.PI };
    }).sort((a, b) => a.from - b.from);
  }

  /* ── Theme checks ─────────────────────────────────────────────────────── */

  function sameSet(a, b) {
    const A = new Set(a), B = new Set(b);
    if (A.size !== B.size) return false;
    for (const x of A) if (!B.has(x)) return false;
    return true;
  }

  function checkTheme(id, th) {
    const issues = [];
    const cat = CATALOG[id];
    if (!th) return ['theme "' + id + '" is missing'];
    if (!cat) return ['theme "' + id + '" is not in the §9.4 catalog'];
    const need = ['id', 'name', 'night', 'sky', 'fog', 'light', 'road', 'rail', 'wall', 'ground', 'liquid', 'props', 'hazards', 'music', 'ambient', 'landmarks'];
    need.forEach((k) => { if (!(k in th)) issues.push('theme.' + k + ' missing'); });
    if (issues.length) return issues;
    const hex = (v, where) => { if (!HEX.test(v)) issues.push(where + ' is not a #rrggbb colour: ' + v); };
    if (th.id !== id) issues.push('theme.id "' + th.id + '" should be "' + id + '"');
    if (!Array.isArray(th.sky) || th.sky.length !== 3) issues.push('sky needs [top, mid, horizon]'); else th.sky.forEach((c, i) => hex(c, 'sky[' + i + ']'));
    hex(th.fog.color, 'fog.color');
    if (!(th.fog.near > 0 && th.fog.far > th.fog.near)) issues.push('fog near/far out of order');
    const L = th.light;
    ['hemiSky', 'hemiGround', 'sunColor'].forEach((k) => hex(L[k], 'light.' + k));
    ['hemiInt', 'sunInt', 'ambInt'].forEach((k) => { if (!(L[k] > 0 && L[k] < 6)) issues.push('light.' + k + ' should be a physical intensity (0..6)'); });
    if (!Array.isArray(L.sunDir) || L.sunDir.length !== 3 || !(L.sunDir[1] > 0)) issues.push('light.sunDir needs [x, y>0, z]');
    if (ROAD_STYLES.indexOf(th.road.style) < 0) issues.push('road.style "' + th.road.style + '" unknown');
    ['base', 'edge', 'lane', 'center'].forEach((k) => hex(th.road[k], 'road.' + k));
    hex(th.rail.a, 'rail.a'); hex(th.rail.b, 'rail.b');
    if (!th.wall.style) issues.push('wall.style missing'); hex(th.wall.color, 'wall.color');
    if (!th.ground.type) issues.push('ground.type missing');
    if (!Array.isArray(th.ground.colors) || th.ground.colors.length !== 2) issues.push('ground.colors needs [a, b]'); else th.ground.colors.forEach((c, i) => hex(c, 'ground.colors[' + i + ']'));
    if (!(th.ground.hills >= 0)) issues.push('ground.hills must be >= 0');
    if (th.liquid !== null) {
      if (LIQUIDS.indexOf(th.liquid.kind) < 0) issues.push('liquid.kind "' + th.liquid.kind + '" unknown');
      hex(th.liquid.color, 'liquid.color'); hex(th.liquid.emissive, 'liquid.emissive');
      if (typeof th.liquid.level !== 'number') issues.push('liquid.level must be a number');
    }
    if (!sameSet(th.props.near, cat.near)) issues.push('props.near must use exactly the §9.4 names: ' + cat.near.join(', '));
    if (!sameSet(th.props.far, cat.far)) issues.push('props.far must use exactly the §9.4 names: ' + cat.far.join(', '));
    if (!sameSet(th.landmarks, cat.landmarks)) issues.push('landmarks must be exactly: ' + cat.landmarks.join(', '));
    if (!(th.props.density > 0 && th.props.density <= 2)) issues.push('props.density should be in (0, 2]');
    HAZARD_KINDS.forEach((k) => { if (th.hazards[k] !== cat.hazards[k]) issues.push('hazards.' + k + ' should be ' + cat.hazards[k]); });
    if (th.music !== id) issues.push('music should be the theme id');
    if (AMBIENTS.indexOf(th.ambient) < 0) issues.push('ambient "' + th.ambient + '" unknown');
    return issues;
  }

  /* ── Track analysis ───────────────────────────────────────────────────── */

  /**
   * @param {object} env { NKSpline, C (NK.C), themes (NK.themes) }
   * @param {object} track a resolved track (NK.tracks.get)
   * @returns {object} stats + issues[] (rule breaks) + warnings[] (taste)
   */
  function analyse(env, track) {
    const S = env.NKSpline, C = env.C;
    const theme = env.themes[track.theme];
    const issues = [], warnings = [];
    const loop = S.buildLoop(track.points, Object.assign({ mirror: !!track.mirror }, track.opts));
    const L = loop.L;
    const v = S.validate(loop, { clearance: RULES.clearance, minRadius: RULES.minRadius, startWindow: RULES.startWindow });
    v.issues.forEach((m) => issues.push(m));

    if (L < RULES.lap[0] || L > RULES.lap[1]) issues.push('lap length ' + L.toFixed(0) + ' m outside ' + RULES.lap.join('-') + ' m');
    if (v.minRadius < RULES.designRadius && v.minRadius >= RULES.minRadius) warnings.push('tightest bend ' + v.minRadius.toFixed(1) + ' m (design target ' + RULES.designRadius + ' m)');
    if (v.maxSlope > RULES.maxSlope) issues.push('max slope ' + (v.maxSlope * 100).toFixed(1) + '% (limit ' + RULES.maxSlope * 100 + '%)');
    if (v.bounds.maxY > RULES.maxAbsY || v.bounds.minY < -RULES.maxAbsY) issues.push('elevation ' + v.bounds.minY.toFixed(1) + '..' + v.bounds.maxY.toFixed(1) + ' m outside ±' + RULES.maxAbsY + ' m');

    /* Bends, drift bends, straights */
    const bends = regions(loop, (k) => Math.abs(k) > RULES.bendK, 16);
    const drifts = regions(loop, (k) => Math.abs(k) >= C.DRIFT_K, 20);
    const straights = regions(loop, (k) => Math.abs(k) < RULES.straightK, 0, false);
    const proper = drifts.filter((d) => d.len >= RULES.driftMinLen);
    drifts.forEach((d) => {
      if (d.len < RULES.driftMinLen) issues.push('drift region only ' + d.len.toFixed(0) + ' m long at s=' + d.from.toFixed(0) + ' (sparks would flicker)');
      else if (d.minR < RULES.driftRadius[0] || d.minR > RULES.driftRadius[1]) warnings.push('drift bend at s=' + d.from.toFixed(0) + ' radius ' + d.minR.toFixed(0) + ' m outside ' + RULES.driftRadius.join('-'));
    });
    if (proper.length < RULES.drifts[0] || proper.length > RULES.drifts[1]) issues.push(proper.length + ' drift bends (want ' + RULES.drifts.join('-') + ')');
    bends.forEach((b) => {
      if (b.minR > RULES.borderline[0] && b.minR < RULES.borderline[1]) warnings.push('bend at s=' + b.from.toFixed(0) + ' radius ' + b.minR.toFixed(0) + ' m sits on the drift threshold');
    });
    const longest = straights.reduce((m, r) => Math.max(m, r.len), 0);
    if (longest < RULES.longStraight) issues.push('longest straight ' + longest.toFixed(0) + ' m (want >= ' + RULES.longStraight + ' m)');

    /* Edges */
    const edgeAt = (s, side) => {
      const f = mod(s, L) / L;
      let kind = 'verge';
      (track.edges || []).forEach((e) => {
        const inside = e.from <= e.to ? (f >= e.from && f < e.to) : (f >= e.from || f < e.to);
        if (inside) kind = e[side];
      });
      return kind;
    };
    (track.edges || []).forEach((e, i) => {
      if (!(e.from >= 0 && e.from <= 1 && e.to >= 0 && e.to <= 1)) issues.push('edges[' + i + '] from/to must be lap fractions');
      ['left', 'right'].forEach((side) => { if (EDGE_KINDS.indexOf(e[side]) < 0) issues.push('edges[' + i + '].' + side + ' "' + e[side] + '" unknown'); });
      (track.edges || []).forEach((o, j) => {
        if (j <= i) return;
        const a0 = e.from, a1 = e.from <= e.to ? e.to : e.to + 1, b0 = o.from, b1 = o.from <= o.to ? o.to : o.to + 1;
        const overl = (x0, x1, y0, y1) => x0 < y1 && y0 < x1;
        if (overl(a0, a1, b0, b1) || overl(a0 + 1, a1 + 1, b0, b1) || overl(a0, a1, b0 + 1, b1 + 1)) issues.push('edges[' + i + '] and edges[' + j + '] overlap');
      });
    });
    let dropM = 0, wallM = 0, dropMinY = Infinity;
    loop.nodes.forEach((nd) => {
      ['left', 'right'].forEach((side) => {
        const k = edgeAt(nd.s, side);
        if (k === 'drop') { dropM += loop.seg / 2; dropMinY = Math.min(dropMinY, nd.y); }
        if (k === 'wall') wallM += loop.seg / 2;
      });
    });
    if (track.theme === 'meadow' && dropM > 0) issues.push('Meadow Circuit must have no drops');
    if (dropM > 0 && theme && theme.liquid && dropMinY < theme.liquid.level + 2.5) issues.push('a drop edge at y=' + dropMinY.toFixed(1) + ' is within 2.5 m of the ' + theme.liquid.kind + ' (level ' + theme.liquid.level + ')');

    /* Features */
    const F = track.features || {};
    const lanesOk = (lanes, where) => {
      if (!Array.isArray(lanes) || !lanes.length) { issues.push(where + ' has no lanes'); return false; }
      for (let i = 0; i < lanes.length; i++) {
        const l = lanes[i];
        if (!(l === (l | 0) && l >= 0 && l < C.LANE_COUNT)) { issues.push(where + ' lane ' + l + ' invalid'); return false; }
        if (i && lanes[i - 1] >= l) { issues.push(where + ' lanes must be sorted and unique'); return false; }
      }
      return true;
    };
    const fracOk = (f, where) => { if (!(f >= 0 && f < 1)) { issues.push(where + ' position ' + f + ' is not a lap fraction'); return false; } return true; };
    const inClearZone = (s) => ahead(0, s, L) < RULES.lineClear || ahead(s, 0, L) <= RULES.gridZone;
    const count = (list, range, name) => {
      const n = (list || []).length;
      if (n < range[0] || n > range[1]) issues.push(n + ' ' + name + ' (want ' + range.join('-') + ')');
    };
    count(F.itemRows, RULES.itemRows, 'Power Box rows');
    count(F.padRows, RULES.padRows, 'Power Pad rows');
    count(F.boostPads, RULES.boostPads, 'Boost Pads');
    count(F.coins, RULES.coins, 'coin lines');
    count(F.ramps, RULES.ramps, 'ramps');
    count(F.hazards, RULES.hazards, 'hazard rows');

    const rows = [];   // every row-type feature in metres: { s, type, lanes, ref }
    const add = (type, list) => (list || []).forEach((r, i) => {
      const where = type + '[' + i + ']';
      if (!fracOk(r.at, where) || !lanesOk(r.lanes, where)) return;
      const s = r.jumpObstacle && Number.isFinite(r.rampAt) && Number.isFinite(r.rampOffset)
        ? mod(r.rampAt * L + r.rampOffset, L) : r.at * L;
      if (inClearZone(s)) issues.push(where + ' at s=' + s.toFixed(0) + ' is on the grid / within ' + RULES.lineClear + ' m of the line');
      rows.push({ s: s, type: type, lanes: r.lanes, ref: r, where: where });
    });
    add('itemRows', F.itemRows);
    add('padRows', F.padRows);
    add('boostPads', F.boostPads);
    add('ramps', F.ramps);
    add('hazards', F.hazards);

    const of = (type) => rows.filter((r) => r.type === type);
    const linkedRamp = (h) => h.jumpObstacle && of('ramps').find((r) => Math.abs(r.ref.at - h.rampAt) < 1e-9);
    of('itemRows').forEach((r) => { if (r.lanes.length < 4) issues.push(r.where + ' should span four or five lanes'); });
    of('padRows').forEach((r) => {
      if (r.lanes.length < 2 || r.lanes.length > 3) issues.push(r.where + ' should span 2-3 lanes');
      const boxes = of('itemRows');
      if (!boxes.length) return;
      const since = Math.min.apply(null, boxes.map((b) => ahead(b.s, r.s, L)));
      if (since < RULES.padAfterBox) issues.push(r.where + ' is only ' + since.toFixed(0) + ' m after a Power Box row (need ' + RULES.padAfterBox + ')');
    });
    of('boostPads').forEach((r) => { if (r.lanes.length > 3) issues.push(r.where + ' boost pads should cover 1-3 lanes'); });

    of('hazards').forEach((r) => {
      const h = r.ref;
      if (HAZARD_KINDS.indexOf(h.kind) < 0) { issues.push(r.where + ' kind "' + h.kind + '" unknown'); return; }
      if (!theme || !theme.hazards[h.kind]) issues.push(r.where + ' kind "' + h.kind + '" has no ' + track.theme + ' model (§9.4)');
      if ((h.kind === 'roller' || h.kind === 'geyser') && !(h.period > 0)) issues.push(r.where + ' ' + h.kind + ' needs a period');
      if (!(h.phase >= 0 && h.phase < 1)) issues.push(r.where + ' phase must be a fraction of the period');
      if (h.kind === 'roller' && (r.lanes.length < 2 || r.lanes[r.lanes.length - 1] - r.lanes[0] !== r.lanes.length - 1)) issues.push(r.where + ' roller lanes must be a contiguous range of 2+');
      const blocked = new Array(C.LANE_COUNT).fill(false);
      r.lanes.forEach((l) => { blocked[l] = true; });
      let run = 0, best = 0;
      blocked.forEach((b) => { run = b ? 0 : run + 1; best = Math.max(best, run); });
      // A full-width glide obstacle is safe only because every lane crosses
      // the same automatic launch. Ordinary hazards still require a bypass.
      if (best < 2 && !linkedRamp(h)) issues.push(r.where + ' leaves no two adjacent lanes clear');
      rows.forEach((o) => {
        if (o === r || o.type === 'hazards' || o.type === 'boostPads') return;
        if (o.type === 'ramps' && linkedRamp(h) === o) return;
        const d = gap(o.s, r.s, L);
        if (d < RULES.hazardGap) issues.push(r.where + ' is ' + d.toFixed(0) + ' m from ' + o.where + ' (need ' + RULES.hazardGap + ')');
      });
      of('boostPads').forEach((o) => {
        if (gap(o.s, r.s, L) < 15 && o.lanes.some((l) => r.lanes.indexOf(l) >= 0)) issues.push(r.where + ' sits on top of ' + o.where);
      });
    });
    // General clutter: two row features on top of each other.
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.type === 'hazards' || b.type === 'hazards') continue;       // covered above
        if (a.type === 'boostPads' && b.type === 'boostPads') continue;
        const d = gap(a.s, b.s, L);
        if (d < RULES.rowGap) issues.push(a.where + ' and ' + b.where + ' are only ' + d.toFixed(0) + ' m apart');
      }
    }
    // Hazard rows closer than a lane change allows would be a wall of obstacles.
    const hz = of('hazards').slice().sort((a, b) => a.s - b.s);
    for (let i = 0; i < hz.length; i++) {
      const a = hz[i], b = hz[(i + 1) % hz.length];
      if (a === b) break;
      const d = ahead(a.s, b.s, L);
      if (d < 30) issues.push(a.where + ' and ' + b.where + ' are only ' + d.toFixed(0) + ' m apart');
    }

    /* Ramps */
    const sampleAt = (s) => S.sample(loop, s);
    of('ramps').forEach((r) => {
      const kind = r.ref.kind;
      if (kind !== 'jump' && kind !== 'glide') { issues.push(r.where + ' kind "' + kind + '" unknown'); return; }
      const flight = C.JUMPS[kind];
      const land = flight.rampLength + flight.flightLength + 12;
      const cleared = of('hazards').filter((h) => linkedRamp(h.ref) === r);
      if (cleared.length !== 1) issues.push(r.where + ' needs exactly one linked obstacle to clear');
      cleared.forEach((h) => {
        if (h.ref.kind !== 'block') issues.push(h.where + ' jump obstacle must be a predictable static block');
        if (JSON.stringify(h.lanes) !== JSON.stringify(r.lanes)) issues.push(h.where + ' jump obstacle lanes must exactly match its ramp');
        if (Math.abs(h.ref.rampOffset - (flight.rampLength + flight.flightLength / 2)) > 0.01)
          issues.push(h.where + ' jump obstacle must sit at the flight apex');
      });
      rows.forEach((o) => {
        if (o === r) return;
        if (o.type === 'hazards' && linkedRamp(o.ref) === r) return;
        const d = ahead(r.s, o.s, L);
        if (d > 0 && d <= land && o.lanes.some((l) => r.lanes.includes(l)))
          issues.push(r.where + ' (' + kind + ') flies over or lands on ' + o.where + ' ' + d.toFixed(0) + ' m after it');
      });
      if (kind === 'jump') {
        let kMax = 0;
        for (let d = -20; d <= RULES.jumpLanding; d += loop.seg) kMax = Math.max(kMax, Math.abs(sampleAt(r.s + d).k));
        if (kMax > 0.006) issues.push(r.where + ' jump is not on a straight (max curvature ' + kMax.toFixed(4) + ')');
        if (r.lanes.length < 2) issues.push(r.where + ' jump should span 2+ lanes');
      } else {
        const drop = sampleAt(r.s).y - sampleAt(r.s + 150).y;
        if (drop < RULES.glideDrop) issues.push(r.where + ' glide is not before a long downhill (falls only ' + drop.toFixed(1) + ' m over 150 m)');
        if (r.lanes.length !== C.LANE_COUNT) issues.push(r.where + ' glide ramps span the whole road');
      }
    });

    /* Coins */
    const coinLines = [];
    (F.coins || []).forEach((c, i) => {
      const where = 'coins[' + i + ']';
      if (!fracOk(c.from, where) || !fracOk(c.to, where)) return;
      if (!(c.lane === (c.lane | 0) && c.lane >= 0 && c.lane < C.LANE_COUNT)) { issues.push(where + ' lane invalid'); return; }
      const s0 = c.from * L, len = ahead(s0, c.to * L, L);
      if (len < RULES.coinLen[0] || len > RULES.coinLen[1]) issues.push(where + ' is ' + len.toFixed(0) + ' m long (want ' + RULES.coinLen.join('-') + ')');
      if (inClearZone(s0) || inClearZone(s0 + len)) issues.push(where + ' runs onto the grid / start zone');
      of('hazards').forEach((h) => {
        if (h.ref.kind === 'roller' || h.ref.kind === 'geyser') return;     // those are the risky line
        if (h.lanes.indexOf(c.lane) < 0) return;
        const d = ahead(s0, h.s, L);
        if (d >= -6 && d <= len + 6) issues.push(where + ' runs through ' + h.where);
      });
      of('ramps').forEach((r) => {
        if (!r.lanes.includes(c.lane)) return;
        const flight = C.JUMPS[r.ref.kind];
        if (!flight) return;
        let start = ahead(r.s, s0, L); if (start > L / 2) start -= L;
        const end = flight.rampLength + flight.flightLength + 12;
        if (start <= end && start + len >= 0)
          issues.push(where + ' lies under ' + r.where + ' flight / landing corridor');
      });
      coinLines.push({ s: s0, len: len, lane: c.lane });
    });

    /* Landmarks */
    const index = S.makeIndex(loop, 32);
    (track.landmarks || []).forEach((m, i) => {
      const where = 'landmarks[' + i + ']';
      if (!fracOk(m.at, where)) return;
      if (m.side !== 1 && m.side !== -1) issues.push(where + ' side must be -1 (left) or 1 (right)');
      if (!theme || theme.landmarks.indexOf(m.prop) < 0) issues.push(where + ' prop "' + m.prop + '" is not a ' + track.theme + ' landmark');
      const p = S.toWorld(loop, m.at * L, m.side * m.off);
      const near = S.nearest(index, p.wx, p.wz, RULES.landmarkClear + 1);
      if (near && near.d < RULES.landmarkClear) issues.push(where + ' (' + m.prop + ') is only ' + near.d.toFixed(0) + ' m from the road');
    });

    return {
      id: track.id, mirror: !!track.mirror, loop: loop, L: L,
      minRadius: v.minRadius, minRadiusAt: v.minRadius === Infinity ? 0 : loop.nodes.reduce((b, n) => (Math.abs(n.k) > Math.abs(b.k) ? n : b), loop.nodes[0]).s,
      minClearance: v.minClearance, maxSlope: v.maxSlope, yMin: v.bounds.minY, yMax: v.bounds.maxY,
      startCurvature: v.startCurvature,
      bends: bends, drifts: proper, straights: straights, longestStraight: longest,
      dropMetres: dropM, wallMetres: wallM,
      counts: {
        itemRows: (F.itemRows || []).length, padRows: (F.padRows || []).length, boostPads: (F.boostPads || []).length,
        coins: (F.coins || []).length, ramps: (F.ramps || []).length, hazards: (F.hazards || []).length,
        landmarks: (track.landmarks || []).length
      },
      edgeAt: edgeAt,
      issues: issues, warnings: warnings
    };
  }

  const api = { CATALOG, CUPS, RULES, analyse, checkTheme, regions };
  root.NKTrackAnalysis = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
