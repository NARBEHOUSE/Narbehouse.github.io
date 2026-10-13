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
    },
    jungle: {
      near: ['jungle_tree', 'giant_fern', 'jungle_flower', 'banana_plant', 'mossy_rock', 'tiki_torch', 'bamboo_clump'],
      far: ['jungle_hill', 'giant_tree', 'temple_ruin', 'waterfall_cliff'],
      landmarks: ['temple_big', 'stone_head'],
      hazards: { block: 'tiki_block', roller: 'coconut', geyser: 'water_spout', puddle: 'jungle_mud' }
    },
    isles: {
      near: ['cloud_puff', 'sky_flower', 'windmill_small', 'banner_pole', 'crystal_small', 'sky_tree'],
      far: ['floating_island', 'airship', 'cloud_castle', 'cloud_bank'],
      landmarks: ['sky_whale', 'sky_castle'],
      hazards: { block: 'cloud_block', roller: 'thunder_ball', geyser: 'wind_gust', puddle: 'rain_puddle' }
    },
    reef: {
      near: ['coral_branch', 'coral_fan', 'brain_coral', 'kelp', 'sea_anemone', 'giant_clam', 'starfish_rock'],
      far: ['coral_tower', 'kelp_forest', 'sunken_temple', 'fish_school'],
      landmarks: ['giant_turtle', 'treasure_galleon'],
      hazards: { block: 'clam_block', roller: 'pufferfish', geyser: 'bubble_vent', puddle: 'seagrass_patch' }
    },
    dino: {
      near: ['cycad', 'tree_fern', 'horsetail', 'egg_nest', 'mossy_boulder', 'baby_dino', 'fossil_rock'],
      far: ['volcano_smoking', 'conifer_tall', 'mesa_green', 'pterodactyl_flock'],
      landmarks: ['long_neck', 'triceratops_big'],
      hazards: { block: 'egg_block', roller: 'rolling_log', geyser: 'hot_spring', puddle: 'tar_puddle' }
    },
    toybox: {
      near: ['toy_blocks', 'crayon_bundle', 'rubber_duck', 'spinning_top', 'wind_up_robot', 'marble_pile', 'dominoes'],
      far: ['book_stack', 'toy_castle', 'block_tower', 'stuffed_bunny'],
      landmarks: ['teddy_giant', 'toy_rocket_big'],
      hazards: { block: 'toy_block', roller: 'bouncy_ball', geyser: 'jack_in_box', puddle: 'juice_spill' }
    },
    carnival: {
      near: ['balloon_cart', 'popcorn_stand', 'lamp_garland', 'prize_booth', 'carnival_flag', 'teacup_ride'],
      far: ['ferris_wheel', 'circus_tent', 'carousel', 'coaster_hill'],
      landmarks: ['ferris_giant', 'drop_tower'],
      hazards: { block: 'gift_block', roller: 'circus_ball', geyser: 'confetti_cannon', puddle: 'soda_spill' }
    },
    neon: {
      near: ['neon_lamp', 'planter_tree', 'hydrant', 'neon_sign', 'city_bench', 'vending_machine'],
      far: ['skyscraper', 'skyscraper_slim', 'billboard_tower', 'apartment_block'],
      landmarks: ['neon_tower', 'giant_cat_sign'],
      hazards: { block: 'road_barrier', roller: 'rolling_tire', geyser: 'steam_manhole', puddle: 'oil_slick' }
    },
    factory: {
      near: ['pipe_stack', 'crate_stack', 'barrel_group', 'gear_post', 'lamp_cage', 'valve_wheel'],
      far: ['smokestack', 'factory_hall', 'gasometer', 'crane_tower'],
      landmarks: ['clock_tower', 'gear_tower'],
      hazards: { block: 'crate_block', roller: 'oil_drum', geyser: 'steam_pipe', puddle: 'oil_puddle' }
    }
  };

  const CUPS = [
    { id: 'sunshine', tracks: ['meadow', 'shores', 'candy', 'dunes'] },
    { id: 'moonlight', tracks: ['frost', 'spooky', 'lava', 'starlight'] },
    { id: 'wonder', tracks: ['jungle', 'isles', 'reef', 'dino'] },
    { id: 'dream', tracks: ['toybox', 'carnival', 'neon', 'factory'] }
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
    landmarkClear: 24,        // landmark origin to the nearest road centreline
    gapStraight: 0.003,       // a landscape gap's road is this straight (|k|) from ramp to landing
    gapGuard: 20,             // walls (never a drop) this far either side of a gap jump
    loopFlat: 0.02,           // a loop's straight is level to within this slope…
    loopStraight: 0.0025,     // …and this straight (|k|), with LOOP_MARGIN metres to spare
    loopMargin: 10,
    loopClear: 30,            // the loop's road keeps this far from other stretches
    pieceClear: 15,           // no row feature this close to a loop or a waterfall
    maxBerm: 0.7,             // steepest berm bank, radians
    archK: 1 / 45,            // archways stand on bends no tighter than the design radius
    archSpan: [2, 8],         // archways per run
    archSpacing: [10, 30]     // metres between archways
  };
  const GAP_SCENES = ['creek', 'inlet', 'choco', 'canyon', 'crevasse', 'ravine', 'moat', 'void', 'gorge', 'sky',
    'trench', 'dinoriver', 'tarpit', 'ballpit', 'street', 'gearpit', 'bumpercars'];
  const CURTAINS = ['water', 'bubbles', 'steam', 'hologram', 'confetti'];

  const EDGE_KINDS = ['wall', 'verge', 'drop'];
  const HAZARD_KINDS = ['block', 'roller', 'geyser', 'puddle'];
  const ROAD_STYLES = ['asphalt', 'rainbow', 'ice', 'candy', 'stone', 'sand'];
  const LIQUIDS = ['water', 'lava', 'chocolate', 'void', 'cloud', 'balls'];
  const AMBIENTS = ['leaves', 'petals', 'snow', 'embers', 'stars', null];
  const HEX = /^#[0-9a-f]{6}$/i;

  const mod = (a, n) => { const r = a % n; return r < 0 ? r + n : r; };
  /** Metres from a to b going forward round the lap. */
  const ahead = (a, b, L) => mod(b - a, L);
  /** Shortest distance between two positions on the lap. */
  const gap = (a, b, L) => { const d = ahead(a, b, L); return Math.min(d, L - d); };
  /** Signed shortest distance from a to b round the lap. */
  const U_loopDelta = (a, b, L) => { const d = ahead(a, b, L); return d > L / 2 ? d - L : d; };

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
    const isGap = (r) => !!(r && r.ref && r.ref.gap);
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
      if (!C.JUMPS[kind]) { issues.push(r.where + ' kind "' + kind + '" unknown'); return; }
      const flight = C.JUMPS[kind];
      const land = flight.rampLength + flight.flightLength + 12;
      const cleared = of('hazards').filter((h) => linkedRamp(h.ref) === r);
      if (isGap(r)) {
        // A landscape gap: the jump clears the gap itself. Every lane launches,
        // the road is straight across, and walls guard the approach and landing.
        if (GAP_SCENES.indexOf(r.ref.gap) < 0) issues.push(r.where + ' gap "' + r.ref.gap + '" is not a known landscape');
        if (r.lanes.length !== C.LANE_COUNT) issues.push(r.where + ' gap jumps span the whole road');
        if (cleared.length) issues.push(r.where + ' gap jumps clear the landscape, not a linked obstacle');
        let kMax = 0;
        for (let d = 0; d <= flight.rampLength + flight.flightLength; d += loop.seg) kMax = Math.max(kMax, Math.abs(sampleAt(r.s + d).k));
        if (kMax > RULES.gapStraight) issues.push(r.where + ' gap is not on a straight (max curvature ' + kMax.toFixed(4) + ')');
        for (let d = -RULES.gapGuard; d <= flight.rampLength + flight.flightLength + RULES.gapGuard; d += loop.seg / 2) {
          if (edgeAt(r.s + d, 'left') !== 'wall' || edgeAt(r.s + d, 'right') !== 'wall') { issues.push(r.where + ' gap needs walls both sides from ' + RULES.gapGuard + ' m before the ramp to ' + RULES.gapGuard + ' m past the landing'); break; }
        }
      } else if (cleared.length !== 1) issues.push(r.where + ' needs exactly one linked obstacle to clear');
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
      if (kind !== 'glide') {
        let kMax = 0;
        for (let d = -20; d <= Math.max(RULES.jumpLanding, flight.rampLength + flight.flightLength + 12); d += loop.seg) kMax = Math.max(kMax, Math.abs(sampleAt(r.s + d).k));
        if (kMax > 0.006) issues.push(r.where + ' ' + kind + ' is not on a straight (max curvature ' + kMax.toFixed(4) + ')');
        if (r.lanes.length < 2) issues.push(r.where + ' ' + kind + ' should span 2+ lanes');
      } else {
        const drop = sampleAt(r.s).y - sampleAt(r.s + 150).y;
        if (drop < RULES.glideDrop) issues.push(r.where + ' glide is not before a long downhill (falls only ' + drop.toFixed(1) + ' m over 150 m)');
        if (r.lanes.length !== C.LANE_COUNT) issues.push(r.where + ' glide ramps span the whole road');
      }
    });

    /* Set pieces: loops and waterfalls */
    const pieces = track.pieces || [];
    const rowNear = (s0, s1, what) => rows.forEach((o) => {
      const a = ahead(s0 - RULES.pieceClear, o.s, L);
      if (a <= (s1 - s0) + 2 * RULES.pieceClear) issues.push(o.where + ' is on or within ' + RULES.pieceClear + ' m of ' + what);
    });
    const index0 = S.makeIndex(loop, 32);
    pieces.forEach((p, i) => {
      const where = 'pieces[' + i + ']';
      if (!fracOk(p.at, where)) return;
      if (p.kind === 'loop') {
        const len = Math.round(C.LOOP.length / loop.seg) * loop.seg, s0 = Math.round(p.at * L / loop.seg) * loop.seg;
        if (p.side !== 1 && p.side !== -1) issues.push(where + ' loop side must be -1 or 1');
        let kMax = 0, slope = 0;
        for (let d = -RULES.loopMargin; d <= len + RULES.loopMargin; d += loop.seg / 2) {
          const a = sampleAt(s0 + d), b = sampleAt(s0 + d + 1);
          kMax = Math.max(kMax, Math.abs(a.k)); slope = Math.max(slope, Math.abs(b.y - a.y));
          if (d >= 0 && d < len && (edgeAt(s0 + d, 'left') !== 'wall' || edgeAt(s0 + d, 'right') !== 'wall')) { issues.push(where + ' loop needs walls both sides'); d = Infinity; }
        }
        if (kMax > RULES.loopStraight) issues.push(where + ' loop is not on a straight (max curvature ' + kMax.toFixed(4) + ')');
        if (slope > RULES.loopFlat) issues.push(where + ' loop is not level (slope ' + (slope * 100).toFixed(1) + '%)');
        rowNear(s0, s0 + len, where + ' (loop)');
        // The loop's road (way up, over and down beside) keeps clear of other road.
        const path = S.loopPath({ radius: C.LOOP.radius, entry: C.LOOP.entry, circle: C.LOOP.circle, length: len, shift: C.LOOP.shift, side: p.side || 1 });
        const base = S.sample(loop, s0), Fx = Math.sin(base.h), Fz = -Math.cos(base.h), Rx = Math.cos(base.h), Rz = Math.sin(base.h);
        for (let sg = 0; sg <= path.arc; sg += 4) {
          const o = path.at(sg), x = base.x + Fx * o.f + Rx * o.l, z = base.z + Fz * o.f + Rz * o.l;
          const near = S.nearest(index0, x, z, RULES.loopClear + 12);
          if (near && near.d < RULES.loopClear && Math.abs(U_loopDelta(near.s, s0 + len / 2, L)) > len / 2 + 40) { issues.push(where + ' loop passes within ' + near.d.toFixed(0) + ' m of another stretch'); break; }
        }
      } else if (p.kind === 'falls') {
        const s = p.at * L;
        if (p.style !== undefined && CURTAINS.indexOf(p.style) < 0) issues.push(where + ' curtain style "' + p.style + '" unknown');
        if (p.gate !== undefined && (typeof p.gate !== 'string' || p.air)) issues.push(where + ' gate must name a prop, and only on the ground');
        rowNear(s - 10, s + 10, where + ' (waterfall)');
        if (p.air) {
          const inFlight = of('ramps').some((r) => isGap(r) && ahead(r.s + C.JUMPS[r.ref.kind].rampLength, s, L) < C.JUMPS[r.ref.kind].flightLength - 10);
          if (!inFlight) issues.push(where + ' an air waterfall must hang inside a gap jump\'s flight');
        } else {
          let kMax = 0;
          for (let d = -15; d <= 15; d += loop.seg) kMax = Math.max(kMax, Math.abs(sampleAt(s + d).k));
          if (kMax > 0.0125) issues.push(where + ' waterfall arch needs a gentle bend at most (curvature ' + kMax.toFixed(4) + ')');
          for (let d = -12; d <= 12; d += 2) if (edgeAt(s + d, 'left') !== 'wall' || edgeAt(s + d, 'right') !== 'wall') { issues.push(where + ' waterfall arch stands on walls both sides'); break; }
        }
      } else if (p.kind === 'arches') {
        // A run of archways over the road: square to a gentle stretch, its
        // feet on solid ground (never a drop), clear of loops and gap jumps.
        const count = p.count || 4, spacing = p.spacing || 14, s0 = p.at * L, len = (count - 1) * spacing;
        if (typeof p.prop !== 'string' || !p.prop) issues.push(where + ' arches need a prop');
        if (count < RULES.archSpan[0] || count > RULES.archSpan[1]) issues.push(where + ' arch count ' + count + ' outside ' + RULES.archSpan.join('-'));
        if (spacing < RULES.archSpacing[0] || spacing > RULES.archSpacing[1]) issues.push(where + ' arch spacing ' + spacing + ' m outside ' + RULES.archSpacing.join('-'));
        let kMax = 0;
        for (let d = -6; d <= len + 6; d += loop.seg / 2) {
          kMax = Math.max(kMax, Math.abs(sampleAt(s0 + d).k));
          if (edgeAt(s0 + d, 'left') === 'drop' || edgeAt(s0 + d, 'right') === 'drop') { issues.push(where + ' arches stand over a drop'); break; }
        }
        if (kMax > RULES.archK) issues.push(where + ' arches stand on too tight a bend (curvature ' + kMax.toFixed(4) + ')');
        pieces.forEach((o) => {
          if (o.kind !== 'loop') return;
          const from = o.at * L - 20, span = C.LOOP.length + 40;
          if (ahead(from, s0, L) <= span || ahead(from, s0 + len, L) <= span) issues.push(where + ' arches overlap a loop');
        });
        of('ramps').forEach((r) => {
          if (!isGap(r)) return;
          const from = r.s - 20, span = C.JUMPS[r.ref.kind].rampLength + C.JUMPS[r.ref.kind].flightLength + 40;
          if (ahead(from, s0, L) <= span || ahead(from, s0 + len, L) <= span) issues.push(where + ' arches overlap a gap jump');
        });
      } else issues.push(where + ' kind "' + p.kind + '" unknown');
    });
    (track.opts && track.opts.banks || []).forEach((z, i) => {
      if (!(z[0] >= 0 && z[0] < 1 && z[1] >= 0 && z[1] <= 1)) issues.push('opts.banks[' + i + '] from/to must be lap fractions');
      if (!(z[2] > 0 && z[2] <= RULES.maxBerm)) issues.push('opts.banks[' + i + '] bank must be in (0, ' + RULES.maxBerm + '] radians');
    });
    if (theme && theme.ground && theme.ground.type === 'islands') {
      const isl = track.islands || [];
      if (!isl.length) issues.push('a sky circuit needs islands');
      const onIsland = (s) => isl.some((sp) => ahead(sp[0] * L, s, L) <= ahead(sp[0] * L, sp[1] * L, L));
      for (let d = -RULES.gridZone; d <= RULES.lineClear; d += 4) if (!onIsland(d)) { issues.push('the start line and grid must sit on an island'); break; }
    }

    /* Coins */
    const coinLines = [];
    (F.coins || []).forEach((c, i) => {
      const where = 'coins[' + i + ']';
      if (!fracOk(c.from, where) || !fracOk(c.to, where)) return;
      const path = Array.isArray(c.lane) ? c.lane : [c.lane];
      if (!path.length || path.some((l) => !(l === (l | 0) && l >= 0 && l < C.LANE_COUNT))) { issues.push(where + ' lane invalid'); return; }
      if (path.some((l, k) => k && Math.abs(l - path[k - 1]) !== 1)) issues.push(where + ' must hop one lane at a time');
      const s0 = c.from * L, len = ahead(s0, c.to * L, L);
      if (len < RULES.coinLen[0] || len > RULES.coinLen[1]) issues.push(where + ' is ' + len.toFixed(0) + ' m long (want ' + RULES.coinLen.join('-') + ')');
      if (inClearZone(s0) || inClearZone(s0 + len)) issues.push(where + ' runs onto the grid / start zone');
      // Runs of coins: [offset from, offset to, lane]; a hopping trail leaves room to change lane.
      let runs = [[0, len, path[0]]];
      if (path.length > 1) {
        const run = (C.COIN_RUN - 1) * C.COIN_GAP, hop = (len - path.length * run) / (path.length - 1);
        if (hop < C.COIN_HOP) issues.push(where + ' leaves ' + hop.toFixed(0) + ' m to change lane (want ' + C.COIN_HOP + ')');
        runs = path.map((l, g) => [g * (run + hop), g * (run + hop) + run, l]);
      }
      of('hazards').forEach((h) => {
        if (h.ref.kind === 'roller' || h.ref.kind === 'geyser') return;     // those are the risky line
        runs.forEach(([a, b, lane]) => {
          if (h.lanes.indexOf(lane) < 0) return;
          const d = U_loopDelta(s0 + a, h.s, L);
          if (d >= -6 && d <= b - a + 6) issues.push(where + ' runs through ' + h.where);
        });
      });
      of('ramps').forEach((r) => {
        if (!path.some((l) => r.lanes.includes(l))) return;
        const flight = C.JUMPS[r.ref.kind];
        if (!flight) return;
        let start = ahead(r.s, s0, L); if (start > L / 2) start -= L;
        const end = flight.rampLength + flight.flightLength + 12;
        if (start <= end && start + len >= 0)
          issues.push(where + ' lies under ' + r.where + ' flight / landing corridor');
      });
      coinLines.push({ s: s0, len: len, lane: path[0], path: path });
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
