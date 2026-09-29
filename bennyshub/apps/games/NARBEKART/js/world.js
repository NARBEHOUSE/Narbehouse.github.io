/**
 * NARBE Racer — world building.
 *
 * Turns a circuit (NK.tracks) and its theme (NK.themes) into everything the
 * player sees and the race drives on:
 *
 *   road      one closed ribbon swept along the centreline — its last row IS
 *             its first row, so the lap has no seam — banked per node and
 *             painted with the theme's road texture;
 *   edges     per section and per rule set (DESIGN §4.5): No-Fail guardrails
 *             everywhere; Open walls, grass verges with kerbs and a low fence,
 *             or sheer drops with a bright trim and no verge;
 *   terrain   a heightfield grid (Race Tracks' side ribbons fold over each
 *             other on a loop) whose height comes from the nearest stretches
 *             of road: tucked just under the road beside it, rolling into the
 *             theme's hills farther out, falling away to the liquid by drops;
 *   sky       dome, fog, sun or moon, stars, clouds and the lights;
 *   scenery   theme props and landmarks, never within reach of any stretch of
 *             road, welded per material per spatial chunk (Race Tracks'
 *             mergeScenery) so a whole circuit costs a few dozen draw calls;
 *   features  Power Boxes and coins (instanced), Power Pads and Boost Pads
 *             (road-following decals), ramps and hazards, with the handles and
 *             pure functions the race simulation reads.
 *
 * Frame conventions are Race Tracks' (js/spline.js): forward (sin h, 0, -cos h),
 * right (cos h, 0, sin h), a -Z-facing mesh points down the road with
 * rotation.y = -h, and bank > 0 lowers the right-hand side.
 */
NK.world = (function () {
  'use strict';

  const U = NK.util;
  const C = NK.C;
  const SP = window.NKSpline;
  const TAU = Math.PI * 2;

  /* ── Road-space dimensions (DESIGN §4, §4.5) ──────────────────────────── */
  const ROAD_HALF = C.ROAD_HALF;                 // 9.5 m of paving either side of the line
  const VERGE_OUT = C.ROAD_HALF + C.SHOULDER;    // 14 m: the far side of a verge
  const PROP_CLEAR = VERGE_OUT + 2;              // scenery never comes nearer any centreline
  const TUCK = 0.35;                             // ground sits this far under road and verge
  const CLAMP = {
    rail: C.laneX(C.LANE_COUNT - 1),             // No-Fail: the outer lane centres (7.2)
    wall: C.ROAD_HALF - C.KART_HALF,             // 8.4
    verge: C.ROAD_HALF + C.SHOULDER - 1.6,       // 12.4
    drop: VERGE_OUT                              // loose on purpose: the fall line comes first
  };
  const FALL_AT = C.ROAD_HALF + 0.3;             // 9.8 m out over a drop, the kart falls
  const TAPER = 6;                               // nodes (≈24 m) a verge funnels in over
  const FENCE_GAP = C.KART_HALF + 0.5;           // the fence stands this far past the clamp
  const KERB_K = 0.0055;                         // bends tighter than r≈180 m get kerbs

  /* ── Terrain ──────────────────────────────────────────────────────────── */
  const T_FINE = 5;          // metres between terrain vertices over the circuit
  const T_PAD = 80;          // fine spacing reaches this far past the circuit's bounds
  const T_GROW = 1.14;       // then the spacing grows by this per step out to the fog
  const T_R = 90;            // a stretch of road shapes the ground within this radius
  const T_D0 = VERGE_OUT + 2;// hills start rising beyond this offset…
  const T_BLEND = 60;        // …and are fully grown this much farther out
  const CLIFF_W = 3.5;       // horizontal run of the fall beside a drop
  const LAKE_RISE = 26;      // the far shore of a drop's lake climbs back over this
  const T_TILE = 64;         // vertices per terrain tile side (one mesh, culled as a unit)

  /* ── Batching ─────────────────────────────────────────────────────────── */
  const EDGE_CHUNK = 240;    // metres of road per edge-dressing mesh
  const PROP_CHUNK = 200;    // metres per side of a scenery merge cell
  const MAX_ANIMATED = 14;   // props that keep their own transform (and draw calls)

  /* ── Features ─────────────────────────────────────────────────────────── */
  const COIN_GAP = 6;        // metres between coins in a line
  const PAD_LEN = 4.4;       // Power Pad, along the road
  const BOOST_LEN = 5.2;     // Boost Pad, along the road
  const PAD_W = C.LANE_W - 0.5;
  const BOX_LIFT = 1.35;     // Power Box centre above the road
  const COIN_LIFT = 0.95;
  const PAD_GLOW = { off: 0.28, on: 0.95 };
  const HAZARD_SIZE = {      // collision half-extents (DESIGN §9.4 hazard sizes)
    block:  { halfWidth: 1.4, halfLength: 1.3 },
    roller: { halfWidth: 1.0, halfLength: 1.0 },
    geyser: { halfWidth: 0.8, halfLength: 0.8 },
    puddle: { halfWidth: 1.8, halfLength: 3.0 }
  };
  const GEYSER_ON = 0.4;     // fraction of the period a geyser is active
  const GEYSER_WARN = 0.5;   // seconds of glowing telegraph before it fires
  /** Rollers that are balls or drums and so should visibly roll as they sweep. */
  const ROLLS = { hay_roll: 1, gumball: 1, snowball: 1, tumbleweed: 1, rolling_boulder: 1, meteor: 1 };

  /* ── Scenery ──────────────────────────────────────────────────────────── */
  /** Props that belong on the liquid surface, not on dry land. */
  const WATER_PROPS = { sailboat: 1, sea_rock: 1, pier: 1 };
  /** Landforms are meant to be half buried; they sink rather than settle. */
  const LANDFORMS = { hill_round: 1, candy_hill: 1, cake_mountain: 1, dune_hill: 1, mesa: 1,
    snowy_mountain: 1, spooky_hill: 1, volcano: 1, sea_rock: 1, rock_spire: 1 };
  /** Props with a front: they turn to face the road instead of a random way. */
  const FACE_ROAD = { barn: 1, windmill: 1, silo: 1, beach_hut: 1, surf_stand: 1, lighthouse: 1,
    cookie_house: 1, desert_sign: 1, cabin: 1, haunted_house: 1, bell_tower: 1, castle_gate: 1,
    castle_wall_piece: 1, castle_tower: 1, gravestone: 1, fence_wood: 1, wafer_fence: 1,
    iron_fence: 1, grandstand: 1, billboard: 1, pit_building: 1, igloo: 1, ice_arch: 1,
    cat_statue: 1, pyramid: 1, space_station: 1, giant_cake: 1, water_tower: 1 };

  /* ── Small helpers ────────────────────────────────────────────────────── */
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
  const lerp = U.lerp;

  /** First index whose value is >= v in a sorted array. */
  function lowerBound(arr, v) {
    let a = 0, b = arr.length;
    while (a < b) { const m = (a + b) >> 1; if (arr[m] < v) a = m + 1; else b = m; }
    return a;
  }

  const warned = new Set();
  function warnOnce(key, msg) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(msg);
  }

  const col = (hex) => new THREE.Color(hex);
  const shade = (c, k) => c.clone().multiplyScalar(k);
  const mixC = (a, b, t) => a.clone().lerp(b, t);
  /** Cheap stable per-index hash in [0, 1). */
  const hash01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

  /* ── Flat-coloured triangle builder ───────────────────────────────────────
   * All of the edge dressing — verges, kerbs, fences, walls, cliff faces,
   * posts — is painted with per-face vertex colours and drawn with ONE shared
   * material, so a whole stretch of it is a single draw call. Faces are
   * oriented by an explicit "towards" vector rather than by vertex order,
   * which makes a culled (invisible) face impossible to write by mistake.
   */
  class Builder {
    constructor() { this.p = []; this.c = []; }
    get empty() { return this.p.length === 0; }
    tri(a, b, c, k) {
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      this.c.push(k.r, k.g, k.b, k.r, k.g, k.b, k.r, k.g, k.b);
    }
    /** Quad p00-p10-p01-p11 (a grid cell), front face turned towards `w`. */
    quad(a, b, c, d, k, w) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * w[0] + ny * w[1] + nz * w[2] < 0) { this.tri(b, a, d, k); this.tri(a, c, d, k); }
      else { this.tri(a, b, c, k); this.tri(b, d, c, k); }
    }
    /** Triangle turned towards `w`. */
    triW(a, b, c, k, w) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * w[0] + ny * w[1] + nz * w[2] < 0) this.tri(a, c, b, k); else this.tri(a, b, c, k);
    }
    /** Box centred at `c` with half extents along the frame vectors R (side),
     *  U (up) and F (forward). The bottom is left open: it sits in the ground. */
    box(c, R, F, hw, hh, hd, k, kTop) {
      const U3 = [0, 1, 0];
      const pt = (sr, su, sf) => [c[0] + R[0] * hw * sr + F[0] * hd * sf, c[1] + hh * su,
                                  c[2] + R[2] * hw * sr + F[2] * hd * sf];
      const nR = [-R[0], 0, -R[2]], nF = [-F[0], 0, -F[2]];
      this.quad(pt(1, -1, -1), pt(1, 1, -1), pt(1, -1, 1), pt(1, 1, 1), k, R);
      this.quad(pt(-1, -1, -1), pt(-1, 1, -1), pt(-1, -1, 1), pt(-1, 1, 1), k, nR);
      this.quad(pt(-1, -1, 1), pt(1, -1, 1), pt(-1, 1, 1), pt(1, 1, 1), k, F);
      this.quad(pt(-1, -1, -1), pt(1, -1, -1), pt(-1, 1, -1), pt(1, 1, -1), k, nF);
      this.quad(pt(-1, 1, -1), pt(1, 1, -1), pt(-1, 1, 1), pt(1, 1, 1), kTop || k, U3);
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    }
  }

  /* ── Fallback art ─────────────────────────────────────────────────────────
   * The road paint, rail stripes, pad panels, Power Boxes, coins and ramps
   * belong to the art kit (js/art-items.js). These plain stand-ins only draw
   * if that file failed to load, so a circuit still builds and reads.
   */
  const FALLBACK_ROAD_TILE = 24;

  function fallbackRoadTex(spec) {
    return NK.art.tex.cached('nk-world-road|' + JSON.stringify(spec), () => NK.art.tex.canvas(256, 512, (g, w, h) => {
      g.fillStyle = spec.base; g.fillRect(0, 0, w, h);
      const u = (x) => ((x + ROAD_HALF) / (2 * ROAD_HALF)) * w;
      g.fillStyle = spec.edge;
      g.fillRect(u(-ROAD_HALF + 0.25), 0, w * 0.03, h);
      g.fillRect(u(ROAD_HALF - 0.25) - w * 0.03, 0, w * 0.03, h);
      g.fillStyle = spec.lane;
      [-5.4, -1.8, 1.8, 5.4].forEach((x) => { for (let y = 0; y < h; y += 128) g.fillRect(u(x) - 3, y, 6, 64); });
      g.fillStyle = spec.center;
      for (let y = 32; y < h; y += 256) g.fillRect(u(0) - 5, y, 10, 128);
    }, { repeat: true, anisotropy: 8 }));
  }

  function fallbackRailTex(a, b) {
    return NK.art.tex.cached('nk-world-rail|' + a + b, () => NK.art.tex.canvas(128, 32, (g, w, h) => {
      g.fillStyle = a; g.fillRect(0, 0, w, h);
      g.fillStyle = b;
      for (let x = -h; x < w; x += 32) {
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill();
      }
      g.fillStyle = NK.art.css(NK.art.INK); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    }, { repeat: true }));
  }

  function fallbackPadTex(kind) {
    return NK.art.tex.cached('nk-world-pad|' + kind, () => NK.art.tex.canvas(128, 160, (g, w, h) => {
      g.fillStyle = '#1d1b2e'; g.fillRect(0, 0, w, h);
      g.fillStyle = kind === 'boost' ? '#c2410c' : '#3b1d8f'; g.fillRect(8, 8, w - 16, h - 16);
      g.fillStyle = kind === 'boost' ? '#ffd23f' : '#ffe14d';
      if (kind === 'boost') {
        for (let k = 0; k < 3; k++) {
          const y = 34 + k * 40;
          g.beginPath(); g.moveTo(24, y + 26); g.lineTo(64, y); g.lineTo(104, y + 26);
          g.lineTo(104, y + 40); g.lineTo(64, y + 14); g.lineTo(24, y + 40); g.closePath(); g.fill();
        }
      } else {
        g.beginPath(); g.moveTo(72, 18); g.lineTo(34, 88); g.lineTo(62, 88); g.lineTo(52, 142);
        g.lineTo(94, 66); g.lineTo(66, 66); g.closePath(); g.fill();
      }
    }));
  }

  /* ── Liquid and night-sky textures (world-owned, cached for rebuilds) ── */
  function liquidTex(kind, base) {
    return NK.art.tex.cached('nk-world-liquid|' + kind + base, () => {
      const r = U.rng(4242);
      return NK.art.tex.canvas(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        if (kind === 'water') {
          // Short pale ripple strokes: enough texture to read as moving water.
          g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 3; g.lineCap = 'round';
          for (let i = 0; i < 60; i++) {
            const x = r.range(0, w), y = r.range(0, h), l = r.range(10, 26);
            g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke();
          }
        } else if (kind === 'lava') {
          // Dark crust plates over the glow: the emissive map lights the gaps.
          g.fillStyle = 'rgba(60,8,0,0.72)';
          for (let i = 0; i < 26; i++) {
            g.beginPath(); g.arc(r.range(0, w), r.range(0, h), r.range(8, 26), 0, TAU); g.fill();
          }
          g.fillStyle = 'rgba(255,214,90,0.8)';
          for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r.range(0, w), r.range(0, h), r.range(1.5, 4), 0, TAU); g.fill(); }
        } else {
          // Chocolate: glossy folded swirls.
          g.strokeStyle = 'rgba(255,220,190,0.22)'; g.lineWidth = 5; g.lineCap = 'round';
          for (let i = 0; i < 24; i++) {
            const x = r.range(0, w), y = r.range(0, h), rad = r.range(10, 30);
            g.beginPath(); g.arc(x, y, rad, r.range(0, 3), r.range(3, 6)); g.stroke();
          }
        }
      }, { repeat: true });
    });
  }

  function nebulaTex() {
    return NK.art.tex.cached('nk-world-nebula', () => {
      const t = NK.art.tex.canvas(256, 256, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      t.colorSpace = THREE.NoColorSpace;
      return t;
    });
  }

  /* ── Art-kit adapters: tolerate either documented signature ────────────── */
  function roadTexture(theme) {
    const T = NK.art.tex;
    if (typeof T.road === 'function') {
      try {
        const t = T.road.length >= 2 ? T.road(theme.road.style, theme.road)
                                     : T.road(Object.assign({ style: theme.road.style }, theme.road));
        if (t && t.isTexture) return { tex: t, tile: NK.art.ROAD_TILE > 0 ? NK.art.ROAD_TILE : FALLBACK_ROAD_TILE };
      } catch (e) { warnOnce('road-tex', 'NK.world: tex.road failed (' + e.message + '), using a plain road'); }
    } else warnOnce('road-tex', 'NK.world: NK.art.tex.road missing, using a plain road');
    return { tex: fallbackRoadTex(theme.road), tile: FALLBACK_ROAD_TILE };
  }

  function railTexture(theme) {
    const T = NK.art.tex;
    if (typeof T.rail === 'function') {
      try {
        const t = T.rail.length >= 2 ? T.rail(theme.rail.a, theme.rail.b) : T.rail(theme.rail);
        if (t && t.isTexture) return t;
      } catch (e) { warnOnce('rail-tex', 'NK.world: tex.rail failed (' + e.message + ')'); }
    }
    return fallbackRailTex(theme.rail.a, theme.rail.b);
  }

  function padTexture(kind) {
    const T = NK.art.tex;
    if (typeof T.pad === 'function') {
      try { const t = T.pad(kind); if (t && t.isTexture) return t; } catch (e) { warnOnce('pad-tex', 'NK.world: tex.pad failed (' + e.message + ')'); }
    }
    return fallbackPadTex(kind);
  }

  /**
   * Instancing parts for a Power Box or coin: [{ geo, mat }], each centred on
   * the item's own origin, so one instance matrix places the whole item.
   * art-items hands back { body, badge, shell } records of { geometry,
   * material }; Meshes, arrays of either, or a whole Object3D work as well.
   */
  function itemParts(kind, owned) {
    const I = NK.art.items || {};
    const fn = I[kind + 'Parts'];
    let src = null;
    if (typeof fn === 'function') {
      try { src = fn(); } catch (e) { warnOnce(kind + '-parts', 'NK.world: items.' + kind + 'Parts failed (' + e.message + ')'); }
    }
    const out = [];
    const add = (geo, mat, matrix) => {
      if (!geo || !mat) return;
      const g = geo.clone();
      if (matrix) g.applyMatrix4(matrix);
      owned.geos.push(g);
      out.push({ geo: g, mat: mat });
    };
    const addAny = (p) => {
      if (!p) return;
      if (p.isObject3D) {
        p.updateMatrixWorld(true);
        p.traverse((m) => { if (m.isMesh) add(m.geometry, m.material, m.matrixWorld); });
      } else add(p.geometry || p.geo, p.material || p.mat, p.matrix || null);
    };
    if (Array.isArray(src)) src.forEach(addAny);
    else if (src && !src.isObject3D && !src.geometry) Object.keys(src).forEach((k) => addAny(src[k]));
    else addAny(src);
    if (out.length) return out;
    if (typeof fn !== 'function') warnOnce(kind + '-parts', 'NK.world: NK.art.items.' + kind + 'Parts missing, using plain ' + kind + 'es');
    return fallbackItemParts(kind, owned);
  }

  function fallbackItemParts(kind, owned) {
    const A = NK.art, list = [];
    const push = (geo, mat) => { owned.geos.push(geo); list.push({ geo: geo, mat: mat }); };
    if (kind === 'box') {
      const body = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      push(body, A.mat.toon(0x7fd7ff, { transparent: true, opacity: 0.72 }));
      push(new THREE.OctahedronGeometry(0.42, 0), A.mat.glow(0xb8860b, 1));
      const shell = A.outline(new THREE.Mesh(body, A.mat.toon(0xffffff)), 0.07);
      push(shell.geometry, shell.material);
    } else {
      const coin = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 22).rotateX(Math.PI / 2);
      push(coin, A.mat.toon(0xffc233, { emissive: 0x3a2400 }));
      const shell = A.outline(new THREE.Mesh(coin, A.mat.toon(0xffffff)), 0.05);
      push(shell.geometry, shell.material);
    }
    return list;
  }

  /* ── Themes ───────────────────────────────────────────────────────────────
   * A track whose theme is missing (themes.js failed to load) still builds on
   * this plain green one rather than taking the menus down with it.
   */
  const FALLBACK_THEME = {
    id: 'fallback', name: 'Plain', night: false,
    sky: ['#2a86dd', '#79c3f1', '#e0f4fb'], fog: { color: '#d6eef8', near: 190, far: 760 },
    light: { hemiSky: '#d8efff', hemiGround: '#6aa84a', hemiInt: 2.1, sunColor: '#fff2d6', sunInt: 3.2, ambInt: 0.6, sunDir: [-0.55, 1.0, 0.45] },
    road: { style: 'asphalt', base: '#7a7686', edge: '#fffaf0', lane: '#aaa6b6', center: '#ffc233' },
    rail: { a: '#e63946', b: '#fdfdfd' }, wall: { style: 'plain', color: '#8a8a8a' },
    ground: { type: 'grass', colors: ['#79c258', '#5ead47'], hills: 6 }, liquid: null,
    props: { near: [], far: [], density: 1 }, landmarks: [],
    hazards: { block: null, roller: null, geyser: null, puddle: null }, music: 'meadow', ambient: null
  };

  /* ── Wall kits ────────────────────────────────────────────────────────────
   * A wall is a cross-section swept along its run of road. Profiles are
   * [outward, up] points from the road-side foot, over the top, to the back
   * foot; `roles` colours each edge between two points. `bumps` wobbles the
   * height per node so hedges and rocks never look ruled.
   */
  const WALL_KITS = {
    hedge: {
      prof: [[0.04, -0.4], [0.04, 0.2], [0.08, 0.86], [0.34, 1.3], [1.0, 1.36], [1.28, 0.92], [1.34, -0.6]],
      roles: ['foot', 'side', 'top', 'top', 'back', 'back'], bumps: 0.16, jitter: 0.1
    },
    rock: {
      prof: [[0.02, -0.5], [0.06, 0.2], [0.3, 1.4], [0.8, 2.15], [1.7, 2.2], [2.3, 1.1], [2.5, -0.8]],
      roles: ['foot', 'side', 'side', 'top', 'back', 'back'], bumps: 0.34, jitter: 0.16
    },
    wafer: {
      prof: [[0.02, -0.4], [0.02, 0.2], [0.02, 1.24], [0.1, 1.46], [0.98, 1.46], [1.06, 1.24], [1.06, -0.6]],
      roles: ['foot', 'side', 'cream', 'cream', 'cream', 'back'], bumps: 0, jitter: 0.02, panels: true
    },
    snow: {
      prof: [[0.04, -0.4], [0.08, 0.2], [0.24, 0.96], [0.7, 1.46], [1.3, 1.42], [1.76, 0.82], [1.9, -0.6]],
      roles: ['foot', 'side', 'top', 'top', 'top', 'back'], bumps: 0.18, jitter: 0.04
    },
    castle: {
      prof: [[0.02, -0.4], [0.02, 0.2], [0.02, 1.85], [1.2, 1.85], [1.2, -0.6]],
      roles: ['foot', 'side', 'top', 'back'], bumps: 0, jitter: 0.05, panels: true, merlons: true
    },
    iron: {
      prof: [[0.02, -0.4], [0.02, 0.2], [0.02, 0.46], [0.62, 0.46], [0.62, -0.6]],
      roles: ['foot', 'stone', 'stoneTop', 'back'], bumps: 0, jitter: 0.04, railing: true
    },
    energy: {
      prof: [[0.02, -0.4], [0.02, 0.26], [0.5, 0.26], [0.5, -0.6]],
      roles: ['foot', 'stoneTop', 'back'], bumps: 0, jitter: 0, beam: true
    },
    plain: {
      prof: [[0.02, -0.4], [0.02, 0.2], [0.02, 1.1], [0.8, 1.1], [0.8, -0.6]],
      roles: ['foot', 'side', 'top', 'back'], bumps: 0, jitter: 0.04
    }
  };

  /* ── Edges ────────────────────────────────────────────────────────────── */
  const EDGE_KINDS = { wall: 1, verge: 1, drop: 1 };

  /**
   * Edge kind of each road segment (node i → i+1) per side, [left, right],
   * sampled at the segment midpoint so a section boundary never splits one.
   * Later entries win and anything unlisted is 'verge', exactly as
   * tools/tracks_analysis.js reads the same data.
   */
  function segmentKinds(track, loop) {
    const N = loop.N;
    const kinds = [new Array(N).fill('verge'), new Array(N).fill('verge')];
    const list = track.edges || [];
    for (let i = 0; i < N; i++) {
      const f = ((i + 0.5) * loop.seg) / loop.L;
      for (let e = 0; e < list.length; e++) {
        const E = list[e];
        const inside = E.from <= E.to ? (f >= E.from && f < E.to) : (f >= E.from || f < E.to);
        if (inside) {
          kinds[0][i] = EDGE_KINDS[E.left] ? E.left : 'verge';
          kinds[1][i] = EDGE_KINDS[E.right] ? E.right : 'verge';
        }
      }
    }
    return kinds;
  }

  /**
   * Per-node edge profile of one side. The verge funnels in over TAPER nodes
   * either side of every wall and drop, so a kart on the verge is always eased
   * back onto the paving before the ground ends (never dropped off it):
   *   vclamp  Open-mode steering limit on a verge segment (lerped along it);
   *   fence   where the verge fence stands — the funnel, drawn;
   *   dropW   0..1, how strongly the ground beside this node falls away;
   *   cliff   lateral offset where that fall begins (behind fence or wall).
   */
  function sideProfile(kind, N, wallT) {
    const touches = (i, k) => kind[i] === k || kind[(i - 1 + N) % N] === k;
    function distTo(k) {
      const d = new Int16Array(N).fill(TAPER + 1);
      for (let i = 0; i < N; i++) if (touches(i, k)) d[i] = 0;
      for (let pass = 0; pass < 2; pass++) {       // twice round, so distances wrap the seam
        for (let i = 0; i < N; i++) { const p = d[(i - 1 + N) % N] + 1; if (p < d[i]) d[i] = p; }
        for (let i = N - 1; i >= 0; i--) { const p = d[(i + 1) % N] + 1; if (p < d[i]) d[i] = p; }
      }
      return d;
    }
    const dDrop = distTo('drop'), dWall = distTo('wall');
    const vclamp = new Float32Array(N), fence = new Float32Array(N);
    const dropW = new Float32Array(N), cliff = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const d = Math.min(dDrop[i], dWall[i]);
      vclamp[i] = CLAMP.wall + (CLAMP.verge - CLAMP.wall) * Math.min(1, d / TAPER);
      // At a drop's end the fence meets the trim at the paving's edge.
      fence[i] = dDrop[i] === 0 ? ROAD_HALF + 0.15 : vclamp[i] + FENCE_GAP;
      dropW[i] = dDrop[i] > TAPER ? 0 : 1 - dDrop[i] / (TAPER + 1);
      if (dDrop[i] === 0) cliff[i] = ROAD_HALF + 0.25;
      else if (touches(i, 'wall')) cliff[i] = ROAD_HALF + wallT + 0.3;
      else cliff[i] = fence[i] + 0.35;
    }
    return { vclamp, fence, dropW, cliff };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  build()
   * ════════════════════════════════════════════════════════════════════════ */

  /**
   * @param {THREE.Scene} scene
   * @param {string} trackId
   * @param {object} [opts] { mode: 'nofail'|'open', mirror: bool,
   *                          quality: { shadows: bool, detail: 'high'|'low' } }
   */
  function build(scene, trackId, opts) {
    const t0 = performance.now();
    opts = opts || {};
    const modeId = typeof opts.mode === 'string' ? opts.mode : (opts.mode && opts.mode.id) || 'open';
    const MODE = C.MODES[modeId] || C.MODES.open;
    const railed = !!MODE.guardrails;
    const mirror = !!opts.mirror;
    const quality = Object.assign({ shadows: true, detail: 'high' }, opts.quality || {});

    const track = NK.tracks.get(trackId, { mirror: mirror });
    const theme = (NK.themes && NK.themes[track.theme]) || FALLBACK_THEME;
    const loop = SP.buildLoop(track.points, Object.assign({ mirror: mirror }, track.opts));
    const nodes = loop.nodes, N = loop.N, L = loop.L, seg = loop.seg;

    const root = new THREE.Group();
    root.name = 'world:' + track.id;
    scene.add(root);
    // Everything this build allocates that is not a shared (cached) material or
    // texture is registered here, so dispose() leaks nothing.
    const owned = { geos: [], mats: [], texs: [] };

    const ctx = {
      scene, root, owned, track, theme, loop, nodes, N, L, seg, mirror, railed, quality,
      // Mirror mode reflects the dressing too, so the mirrored circuit looks
      // like the original seen in a mirror rather than a reshuffled one.
      sideSign: mirror ? -1 : 1,
      voidWorld: !theme.ground || theme.ground.type === 'none',
      liquid: theme.liquid && theme.liquid.kind !== 'void' ? theme.liquid : null
    };

    /* Precomputed node trig: every sweep below reads these. */
    const cosH = new Float64Array(N), sinH = new Float64Array(N), sinB = new Float64Array(N);
    const slope = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      cosH[i] = Math.cos(nodes[i].h); sinH[i] = Math.sin(nodes[i].h); sinB[i] = Math.sin(nodes[i].bank);
      slope[i] = (nodes[(i + 1) % N].y - nodes[(i - 1 + N) % N].y) / (2 * seg);
    }
    Object.assign(ctx, { cosH, sinH, sinB });

    /** World point at node i, lateral offset `off`, `dy` above the banked
     *  surface there. Past the verge the bank stops growing, as the ground does. */
    ctx.P = (i, off, dy) => {
      const oc = off < -VERGE_OUT ? -VERGE_OUT : (off > VERGE_OUT ? VERGE_OUT : off);
      const nd = nodes[i];
      return [nd.x + cosH[i] * off, nd.y - oc * sinB[i] + (dy || 0), nd.z + sinH[i] * off];
    };
    ctx.Rv = (i) => [cosH[i], 0, sinH[i]];
    ctx.Fv = (i) => [sinH[i], 0, -cosH[i]];

    /* Edges, per rule set. */
    const kinds = segmentKinds(track, loop);
    const kit = WALL_KITS[theme.wall && theme.wall.style] || WALL_KITS.plain;
    const wallT = kit.prof.reduce((m, p) => Math.max(m, p[0]), 0);
    const prof = [sideProfile(kinds[0], N, wallT), sideProfile(kinds[1], N, wallT)];
    Object.assign(ctx, { kinds, prof, kit, wallT });
    ctx.pal = palette(theme);

    /* Spatial index over the centreline (props, terrain, anyone asking). */
    const index = SP.makeIndex(loop, 32);
    ctx.index = index;

    const stats = {};
    const lapT = (k) => { stats[k] = +(performance.now() - t0).toFixed(1); };

    const sky = buildSky(ctx); lapT('sky');
    const terrain = ctx.voidWorld ? null : buildTerrain(ctx); lapT('terrain');
    ctx.groundAt = terrain ? terrain.groundAt : () => -Infinity;
    const liquid = buildLiquid(ctx, terrain); lapT('liquid');
    buildRoad(ctx); lapT('road');
    buildEdges(ctx); lapT('edges');
    const start = buildStartArea(ctx); lapT('start');
    const features = buildFeatures(ctx); lapT('features');
    const scenery = placeScenery(ctx); lapT('scenery');

    /* ── Frame lookup ─────────────────────────────────────────────────────
     * One frame object, reused by every call: read what you need (or copy
     * the vectors) before calling again. Nothing here allocates.
     */
    const frame = {
      pos: new THREE.Vector3(), right: new THREE.Vector3(), forward: new THREE.Vector3(),
      heading: 0, yaw: 0, bank: 0, curvature: 0, y: 0, pitch: 0, s: 0
    };
    function frameAt(s) {
      const sm = U.mod(s, L);
      const f = sm / seg;
      let i = Math.floor(f);
      if (i >= N) i = N - 1;
      const t = f - i;
      const a = nodes[i], b = nodes[(i + 1) % N];
      const h = a.h + SP.wrapAngle(b.h - a.h) * t;
      const y = a.y + (b.y - a.y) * t;
      frame.pos.set(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
      const c = Math.cos(h), sn = Math.sin(h);
      frame.right.set(c, 0, sn);
      frame.forward.set(sn, 0, -c);
      frame.heading = h;
      frame.yaw = -h;
      frame.bank = a.bank + (b.bank - a.bank) * t;
      frame.curvature = a.k + (b.k - a.k) * t;
      frame.y = y;
      frame.pitch = Math.atan(slope[i] + (slope[(i + 1) % N] - slope[i]) * t);
      frame.s = sm;
      return frame;
    }

    /** Road surface point at (s, x), banking included. */
    function pointAt(s, x, out) {
      const f = frameAt(s);
      const v = out || new THREE.Vector3();
      v.copy(f.pos).addScaledVector(f.right, x);
      v.y -= x * Math.sin(f.bank);
      return v;
    }

    /* ── Edge rules (DESIGN §4.5), precomputed per node ──────────────────── */
    const edgeObjs = new Array(N);
    for (let i = 0; i < N; i++) {
      edgeObjs[i] = Object.freeze(railed ? { left: 'rail', right: 'rail' }
                                         : { left: kinds[0][i], right: kinds[1][i] });
    }
    const segOf = (s) => { let i = Math.floor(U.mod(s, L) / seg); return i >= N ? N - 1 : i; };
    /** Edge kinds at s: 'wall' | 'verge' | 'drop', or 'rail' in No-Fail. Frozen, shared. */
    function edgeAt(s) { return edgeObjs[segOf(s)]; }

    const limitsOut = { minX: 0, maxX: 0, fallL: -Infinity, fallR: Infinity };
    function sideLimit(side, i, t) {
      const k = kinds[side][i];
      if (k === 'wall') return CLAMP.wall;
      if (k === 'drop') return CLAMP.drop;
      const v = prof[side].vclamp;
      return v[i] + (v[(i + 1) % N] - v[i]) * t;
    }
    /**
     * Steering clamp and fall thresholds at s for this rule set: clamp x to
     * [minX, maxX]; x < fallL or x > fallR means the kart has gone over a drop
     * (±Infinity where it cannot). Fills `out` if given, else a reused object.
     */
    function limits(s, out) {
      const o = out || limitsOut;
      if (railed) {
        o.minX = -CLAMP.rail; o.maxX = CLAMP.rail; o.fallL = -Infinity; o.fallR = Infinity;
        return o;
      }
      const f = U.mod(s, L) / seg;
      let i = Math.floor(f);
      if (i >= N) i = N - 1;
      const t = f - i;
      o.minX = -sideLimit(0, i, t);
      o.maxX = sideLimit(1, i, t);
      o.fallL = kinds[0][i] === 'drop' ? -FALL_AT : -Infinity;
      o.fallR = kinds[1][i] === 'drop' ? FALL_AT : Infinity;
      return o;
    }

    /* ── Hazards: a pure function of time (DESIGN §7) ─────────────────────── */
    const HZ = features.resolved.hazards;
    /**
     * Where hazard i is and whether it bites at time t (seconds, race time).
     * { x, active, warn, u }: warn = a geyser's telegraph, u = cycle phase 0..1.
     * Fills `out` if given (use that in hot loops), else returns a new object.
     */
    function hazardState(i, t, out) {
      const h = HZ[i];
      const o = out || {};
      if (!h) { o.x = 0; o.active = false; o.warn = false; o.u = 0; return o; }
      const u = h.period > 0 ? U.mod(t / h.period + h.phase, 1) : 0;
      o.u = u;
      if (h.kind === 'roller') {
        o.x = h.xMid + h.sweepDir * h.halfSpan * Math.sin(u * TAU);
        o.active = true; o.warn = false;
      } else if (h.kind === 'geyser') {
        o.x = h.x;
        o.active = u < GEYSER_ON;
        o.warn = !o.active && (1 - u) * h.period <= GEYSER_WARN;
      } else {
        o.x = h.x; o.active = true; o.warn = false;
      }
      return o;
    }

    /* ── Starting grid (DESIGN §3.2): two per row, staggered, behind the line */
    const GRID_FRONT = 4, GRID_ROW = 6;
    function startGrid(n) {
      const out = [];
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / 2), colIdx = k % 2;
        out.push({
          progress: -(GRID_FRONT + row * GRID_ROW + colIdx * GRID_ROW * 0.5),
          x: C.laneX(colIdx === 0 ? 1 : 3)
        });
      }
      return out;
    }

    /* ── Minimap: the centreline as interleaved x, z ─────────────────────── */
    const mmPts = new Float32Array(N * 2);
    const bnd = SP.bounds(loop);
    for (let i = 0; i < N; i++) { mmPts[i * 2] = nodes[i].x; mmPts[i * 2 + 1] = nodes[i].z; }
    const minimap = {
      pts: mmPts,
      bounds: { minX: bnd.minX - ROAD_HALF, maxX: bnd.maxX + ROAD_HALF, minZ: bnd.minZ - ROAD_HALF, maxZ: bnd.maxZ + ROAD_HALF }
    };

    /* ── Per-view hooks ───────────────────────────────────────────────────── */
    function setPadGlow(on) {
      features.padMat.emissiveIntensity = on ? PAD_GLOW.on : PAD_GLOW.off;
    }

    /**
     * Aim the sun's shadow frustum at a point (≈20 m ahead of the player's
     * kart works well). Snapped to whole shadow-map texels in light space, so
     * shadow edges stay still instead of crawling as the camera moves.
     */
    const _sf = new THREE.Vector3(), _sr = new THREE.Vector3(), _su = new THREE.Vector3();
    function setShadowFocus(p) {
      const sun = sky.sun;
      _sr.crossVectors(sky.sunDir, Math.abs(sky.sunDir.y) > 0.99 ? _su.set(1, 0, 0) : _su.set(0, 1, 0)).normalize();
      _su.crossVectors(_sr, sky.sunDir).normalize();
      const texel = (2 * sky.shadowHalf) / sun.shadow.mapSize.x;
      const a = Math.round(p.dot(_sr) / texel) * texel - p.dot(_sr);
      const b = Math.round(p.dot(_su) / texel) * texel - p.dot(_su);
      _sf.copy(p).addScaledVector(_sr, a).addScaledVector(_su, b);
      sun.target.position.copy(_sf);
      sun.position.copy(_sf).addScaledVector(sky.sunDir, sky.shadowDist);
      sun.target.updateMatrixWorld();
    }
    setShadowFocus(frameAt(0).pos);

    /** Keep the sky, stars and sun disc centred on a camera (call per view). */
    function followCamera(p) { sky.follow(p); }

    /* ── Per frame ────────────────────────────────────────────────────────── */
    const _hs = { x: 0, active: false, warn: false, u: 0 };
    function update(dt, t, cameraPos) {
      if (cameraPos) sky.follow(cameraPos);
      scenery.update(t, dt);
      features.update(t, dt, hazardState, _hs);
      if (liquid) liquid.update(t);
      sky.update(t);
    }

    /* ── Teardown ─────────────────────────────────────────────────────────── */
    function dispose() {
      scene.remove(root);
      if (scene.fog === sky.fog) scene.fog = null;
      if (scene.background === sky.background) scene.background = null;
      const seen = new Set();
      root.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
        if (o.isInstancedMesh && o.dispose) o.dispose();
      });
      owned.geos.forEach((g) => { if (!seen.has(g.uuid)) g.dispose(); });
      owned.mats.forEach((m) => m.dispose());
      owned.texs.forEach((t) => t.dispose());
      if (sky.sun.shadow && sky.sun.shadow.map) { sky.sun.shadow.map.dispose(); sky.sun.shadow.map = null; }
    }

    stats.buildMs = +(performance.now() - t0).toFixed(1);
    stats.nodes = N;
    stats.props = scenery.count;
    stats.animated = scenery.animated;
    stats.sceneryMeshes = scenery.meshes;
    stats.terrainVerts = terrain ? terrain.verts : 0;

    return {
      track, theme, loop, L, mode: modeId, mirror,
      group: root, sun: sky.sun, hemi: sky.hemi, amb: sky.amb,
      gantry: start.gantry,
      liquidLevel: ctx.liquid ? ctx.liquid.level : null,
      roadHalf: ROAD_HALF, shoulder: C.SHOULDER,
      frameAt, pointAt, edgeAt, limits,
      features: features.resolved, handles: features.handles, hazardState,
      setPadGlow, setShadowFocus, followCamera,
      startGrid, minimap,
      groundAt: ctx.groundAt,
      nearest: (x, z, maxDist) => SP.nearest(index, x, z, maxDist || 60),
      update, dispose,
      stats
    };
  }

  /* ── Palette derived from a theme ─────────────────────────────────────── */
  function palette(theme) {
    const gA = col(theme.ground.colors[0]), gB = col(theme.ground.colors[1]);
    const wall = col(theme.wall.color);
    const ink = col(NK.art.INK);
    const railA = col(theme.rail.a), railB = col(theme.rail.b);
    const liquid = theme.liquid ? col(theme.liquid.color) : gB;
    return {
      gA, gB, ink, railA, railB, wall,
      shoulder: shade(mixC(gA, gB, 0.5), 0.86),
      rock: shade(mixC(wall, gB, 0.35), 0.78),
      bed: shade(mixC(gB, liquid, 0.55), 0.7),
      trim: col(theme.road.edge),
      post: shade(mixC(railA, ink, 0.25), 0.95),
      cream: mixC(col('#fff6ea'), railA, 0.18)
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Sky, fog and light
   * ════════════════════════════════════════════════════════════════════════ */
  function buildSky(ctx) {
    const { theme, root, owned, quality } = ctx;
    const A = NK.art, Lt = theme.light;
    const scene = ctx.scene;

    const fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    const background = new THREE.Color(theme.fog.color);
    scene.fog = fog;
    scene.background = background;

    /* Dome: the gradient is re-mapped by elevation so the horizon colour
       sits ON the horizon (a plain sphere UV would put it at the south pole).
       With no ground (space) the lower half mirrors the upper. */
    const R = 950;
    const skyGeo = new THREE.SphereGeometry(R, 32, 20);
    const pos = skyGeo.attributes.position, uv = skyGeo.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      let e = Math.asin(Math.max(-1, Math.min(1, pos.getY(k) / R))) / (Math.PI / 2);
      if (e < 0) e = ctx.voidWorld ? -e : 0;
      uv.setY(k, Math.pow(e, 0.72));
    }
    owned.geos.push(skyGeo);
    const skyMat = A.mat.basic(0xffffff, { map: A.tex.sky(theme.sky[0], theme.sky[1], theme.sky[2]), side: 'back', fog: false, depthWrite: false });
    const dome = new THREE.Mesh(skyGeo, skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    root.add(dome);
    const skyFollow = [dome];

    /* Lights: physical intensities straight from the theme (Race Tracks' rig). */
    const hemi = new THREE.HemisphereLight(Lt.hemiSky, Lt.hemiGround, Lt.hemiInt);
    const amb = new THREE.AmbientLight(0xffffff, Lt.ambInt);
    const sun = new THREE.DirectionalLight(Lt.sunColor, Lt.sunInt);
    const sunDir = new THREE.Vector3(Lt.sunDir[0], Lt.sunDir[1], Lt.sunDir[2]).normalize();
    const shadowHalf = 70, shadowDist = 160;
    if (quality.shadows) {
      sun.castShadow = true;
      // 1024 texels over 140 m: crisp enough at this chunky scale, a quarter
      // of 2048's fill cost (Race Tracks' measurement).
      sun.shadow.mapSize.set(1024, 1024);
      const sc = sun.shadow.camera;
      sc.left = -shadowHalf; sc.right = shadowHalf; sc.top = shadowHalf; sc.bottom = -shadowHalf;
      sc.near = 1; sc.far = shadowDist * 2;
      sun.shadow.bias = -0.0016;
      sun.shadow.normalBias = 0.035;
    }
    root.add(hemi, amb, sun, sun.target);

    /* Sun or moon: a flat cartoon disc billboarded at the camera, low in the
       sky at the light's own compass bearing so it shows in the chase view. */
    const skyDir = new THREE.Vector3(sunDir.x, 0, sunDir.z);
    if (skyDir.lengthSq() < 1e-6) skyDir.set(0, 0, -1);
    skyDir.normalize().multiplyScalar(Math.cos(0.36)).setY(Math.sin(0.36));
    const disc = theme.night ? (ctx.voidWorld ? null : moonDisc(theme)) : sunDisc(theme);
    if (disc) { owned.geos.push(disc.geometry); disc.renderOrder = -8; root.add(disc); }

    /* Stars on every night theme; all round the dome in space. */
    let stars = null;
    if (theme.night) {
      stars = starfield(ctx, R * 0.94);
      owned.geos.push(stars.geometry); owned.mats.push(stars.material);
      root.add(stars);
      skyFollow.push(stars);
    }

    /* Space gets a few soft nebula glows so the void has depth. */
    if (ctx.voidWorld) {
      const neb = nebulae(ctx, R * 0.9);
      root.add(neb);
      skyFollow.push(neb);
    }

    /* Clouds over day themes, welded into a few meshes around the circuit. */
    if (!theme.night) buildClouds(ctx);

    const _p = new THREE.Vector3();
    return {
      fog, background, hemi, amb, sun, sunDir, shadowHalf, shadowDist,
      follow(p) {
        for (let i = 0; i < skyFollow.length; i++) skyFollow[i].position.copy(p);
        if (disc) {
          disc.position.copy(p).addScaledVector(skyDir, R * 0.82);
          disc.lookAt(_p.copy(p));
        }
      },
      update(t) {
        if (stars) stars.rotation.y = t * 0.004;
      }
    };
  }

  /** Flat sun: a warm core, a paler ring and chunky triangular rays (one mesh). */
  function sunDisc(theme) {
    const B = new Builder();
    const core = col('#fff3b0'), ring = col('#ffe07a'), ray = col('#ffc94d');
    const f = [0, 0, 1];
    const ring3 = (r, z) => (a) => [Math.cos(a) * r, Math.sin(a) * r, z];
    const n = 28;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
      B.triW([0, 0, 0.2], ring3(34, 0.2)(a0), ring3(34, 0.2)(a1), core, f);
      B.quad(ring3(34, 0.1)(a0), ring3(42, 0.1)(a0), ring3(34, 0.1)(a1), ring3(42, 0.1)(a1), ring, f);
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, w = 0.12;
      B.triW(ring3(45, 0)(a - w), ring3(45, 0)(a + w), ring3(62, 0)(a), ray, f);
    }
    const m = new THREE.Mesh(B.geometry(), NK.art.mat.basic(0xffffff, { vertexColors: true, fog: false }));
    m.frustumCulled = false;
    return m;
  }

  /** Pale moon with a few darker craters. */
  function moonDisc(theme) {
    const B = new Builder();
    const face = col('#f3eedc'), crater = col('#d7cfb8'), rim = col('#fffbea');
    const f = [0, 0, 1];
    const disc = (cx, cy, r, z, k) => {
      const n = 24;
      for (let q = 0; q < n; q++) {
        const a0 = (q / n) * TAU, a1 = ((q + 1) / n) * TAU;
        B.triW([cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], k, f);
      }
    };
    disc(0, 0, 40, 0, rim);
    disc(0, 0, 37, 0.2, face);
    disc(-12, 9, 8, 0.4, crater);
    disc(11, -6, 11, 0.4, crater);
    disc(4, 17, 5, 0.4, crater);
    const m = new THREE.Mesh(B.geometry(), NK.art.mat.basic(0xffffff, { vertexColors: true, fog: false }));
    m.frustumCulled = false;
    return m;
  }

  function starfield(ctx, rad) {
    const r = U.rng((ctx.track.seed ^ 0x51a7) >>> 0);
    const all = ctx.voidWorld;
    const count = all ? 2600 : 900;
    const p = new Float32Array(count * 3), c = new Float32Array(count * 3);
    const k = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = all ? r.range(-1, 1) : r.range(0.06, 1);
      const th = r.range(0, TAU), sq = Math.sqrt(1 - u * u);
      p[i * 3] = Math.cos(th) * sq * rad; p[i * 3 + 1] = u * rad; p[i * 3 + 2] = Math.sin(th) * sq * rad;
      k.setHSL(r.range(0.5, 0.78), r.range(0, 0.5), r.range(0.72, 1));
      c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({
      size: all ? 2.6 : 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false
    }));
    m.renderOrder = -9;
    m.frustumCulled = false;
    return m;
  }

  function nebulae(ctx, rad) {
    const r = U.rng((ctx.track.seed ^ 0x6e62) >>> 0);
    const g = new THREE.Group();
    const tex = nebulaTex();
    const tints = ['#7a2cff', '#ff3fb4', '#1fb6ff', '#5b3cff'];
    const mats = tints.map((c) => new THREE.MeshBasicMaterial({
      color: c, map: tex, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    }));
    mats.forEach((m) => ctx.owned.mats.push(m));
    for (let i = 0; i < 7; i++) {
      const mat = mats[i % mats.length];
      const size = r.range(420, 760);
      const geo = new THREE.PlaneGeometry(size, size * r.range(0.45, 0.8));
      ctx.owned.geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      const th = r.range(0, TAU), el = r.range(-0.9, 0.5);
      m.position.set(Math.cos(th) * Math.cos(el) * rad, Math.sin(el) * rad, Math.sin(th) * Math.cos(el) * rad);
      m.lookAt(0, 0, 0);
      m.rotateZ(r.range(0, TAU));
      m.renderOrder = -9;
      m.frustumCulled = false;
      g.add(m);
    }
    return g;
  }

  /**
   * Race Tracks' stacked-lobe clouds: smooth spheres (faceted lobes read as
   * rubble against a blue sky), undersides a touch cooler for volume, welded
   * into one mesh per quarter of the sky so the ones behind the camera cull.
   */
  function buildClouds(ctx) {
    const { theme, loop, root, owned } = ctx;
    const r = U.rng((ctx.track.seed ^ 0xc10d) >>> 0);
    const b = SP.bounds(loop);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 260;
    const sandy = theme.ground.type === 'sand';
    const count = Math.round((sandy ? 12 : 26) * (ctx.quality.detail === 'low' ? 0.6 : 1));
    const tint = mixC(col('#ffffff'), col(theme.sky[1]), 0.08), under = shade(tint, 0.86);
    const sectors = [[], [], [], []];
    for (let i = 0; i < count; i++) {
      const x = cx + r.range(-span, span), z = cz + r.range(-span, span);
      const y = r.range(70, 150), rot = r.range(0, TAU), scale = r.range(1.0, 2.0);
      const list = sectors[(x > cx ? 1 : 0) + (z > cz ? 2 : 0)];
      const lobes = r.int(4, 6);
      const pieces = [];
      let lx = 0;
      for (let k = 0; k < lobes; k++) {
        const rad = r.range(4.2, 7.0) * (1 - Math.abs(k - (lobes - 1) / 2) / (lobes * 1.5));
        pieces.push([lx, r.range(-0.4, 0.8), r.range(-1.2, 1.2), rad, r.range(0.62, 0.8)]);
        lx += rad * r.range(1.0, 1.35);
      }
      pieces.forEach((pc) => {
        const g = new THREE.SphereGeometry(pc[3], 12, 8);
        g.scale(1, pc[4], 1).translate(pc[0] - lx / 2, pc[1], pc[2]).rotateY(rot).scale(scale, scale, scale).translate(x, y, z);
        const P = g.attributes.position, cArr = new Float32Array(P.count * 3);
        for (let v = 0; v < P.count; v++) {
          const k = P.getY(v) < y ? under : tint;
          cArr[v * 3] = k.r; cArr[v * 3 + 1] = k.g; cArr[v * 3 + 2] = k.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
        list.push(g);
      });
    }
    const mat = NK.art.mat.lambertV({ smooth: true });
    sectors.forEach((list) => {
      if (!list.length) return;
      const geo = mergeIndexed(list);
      owned.geos.push(geo);
      root.add(new THREE.Mesh(geo, mat));
    });
  }

  /** Concatenate indexed geometries that share position/normal/color. */
  function mergeIndexed(list) {
    let vc = 0, ic = 0;
    list.forEach((g) => { vc += g.attributes.position.count; ic += g.index.count; });
    const P = new Float32Array(vc * 3), Nn = new Float32Array(vc * 3), Cc = new Float32Array(vc * 3);
    const I = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    list.forEach((g) => {
      P.set(g.attributes.position.array, vo * 3);
      Nn.set(g.attributes.normal.array, vo * 3);
      Cc.set(g.attributes.color.array, vo * 3);
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) I[io + k] = src[k] + vo;
      vo += g.attributes.position.count; io += src.length;
      g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    out.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    out.setIndex(new THREE.BufferAttribute(I, 1));
    out.computeBoundingSphere();
    return out;
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Terrain
   * ════════════════════════════════════════════════════════════════════════
   * A rectilinear grid over the circuit's bounds (fine spacing), growing
   * geometrically out to the fog. Each vertex takes its height from the
   * nearest node of the road and — where another stretch of road is near
   * too — from that stretch, blended by steep distance weights, so the
   * ground between two roads at different heights is a smooth slope rather
   * than a crease. Within each stretch's own model:
   *   under the road and verge  the banked surface, TUCK below;
   *   beside a drop             falls to below the liquid over CLIFF_W,
   *                             then a lake whose far shore climbs back;
   *   farther out               blends into a regional base (a smoothed
   *                             road height) plus the theme's rolling hills.
   */
  function buildTerrain(ctx) {
    const { loop, nodes, N, seg, theme, prof, cosH, sinH, sinB, owned, root } = ctx;
    const b = SP.bounds(loop);
    const reach = theme.fog.far + 220;
    const detail = ctx.quality.detail === 'low' ? 1.5 : 1;

    function axis(lo, hi) {
      const st = T_FINE * detail;
      const n = Math.max(2, Math.ceil((hi - lo) / st));
      const step = (hi - lo) / n;
      const mid = [];
      for (let i = 0; i <= n; i++) mid.push(lo + i * step);
      const left = [], right = [];
      for (let d = step, x = lo; lo - x < reach;) { d *= T_GROW; x -= d; left.push(x); }
      for (let d = step, x = hi; x - hi < reach;) { d *= T_GROW; x += d; right.push(x); }
      return Float64Array.from(left.reverse().concat(mid, right));
    }
    const xs = axis(b.minX - T_PAD, b.maxX + T_PAD);
    const zs = axis(b.minZ - T_PAD, b.maxZ + T_PAD);
    const nx = xs.length, nz = zs.length, V = nx * nz;

    /* Regional base: road height smoothed over ~80 m on a coarse grid, easing
       to the lap's mean far away, so hills sit on the land the road runs
       through rather than on one absolute level. */
    const meanY = nodes.reduce((a, n) => a + n.y, 0) / N;
    const RC = 40, sig2 = 2 * 80 * 80;
    const rx0 = xs[0], rz0 = zs[0];
    const rnx = Math.ceil((xs[nx - 1] - rx0) / RC) + 1, rnz = Math.ceil((zs[nz - 1] - rz0) / RC) + 1;
    const reg = new Float32Array(rnx * rnz);
    for (let j = 0; j < rnz; j++) {
      for (let i = 0; i < rnx; i++) {
        const px = rx0 + i * RC, pz = rz0 + j * RC;
        let w = 1e-4, wy = 1e-4 * meanY;
        for (let q = 0; q < N; q += 2) {
          const dx = px - nodes[q].x, dz = pz - nodes[q].z, d2 = dx * dx + dz * dz;
          if (d2 > 9 * sig2) continue;
          const g = Math.exp(-d2 / sig2);
          w += g; wy += g * nodes[q].y;
        }
        reg[j * rnx + i] = wy / w;
      }
    }
    function regional(px, pz) {
      const fx = Math.max(0, Math.min(rnx - 1.0001, (px - rx0) / RC)), fz = Math.max(0, Math.min(rnz - 1.0001, (pz - rz0) / RC));
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      const a = reg[j * rnx + i], bb = reg[j * rnx + i + 1], c = reg[(j + 1) * rnx + i], d = reg[(j + 1) * rnx + i + 1];
      return (a + (bb - a) * tx) + ((c + (d - c) * tx) - (a + (bb - a) * tx)) * tz;
    }

    /* Hills: a few summed sines, squared so valleys are broad and tops round,
       growing into a ring of bigger hills past the circuit to close the view. */
    const hr = U.rng((ctx.track.seed ^ 0x9e3779b9) >>> 0);
    const ph = [0, 0, 0, 0, 0, 0, 0].map(() => hr.range(0, TAU));
    const amp = theme.ground.hills || 0;
    const mx = ctx.mirror ? -1 : 1;
    function hills(px, pz) {
      const x = px * mx;
      const n = 0.52 + 0.3 * Math.sin(x * 0.0113 + ph[0]) * Math.cos(pz * 0.0097 + ph[1]) +
                0.2 * Math.sin((x + pz) * 0.0171 + ph[2]) + 0.1 * Math.sin((x * 0.8 - pz) * 0.033 + ph[3]);
      const hh = n < 0 ? 0 : n;
      const ox = Math.max(0, b.minX - px, px - b.maxX), oz = Math.max(0, b.minZ - pz, pz - b.maxZ);
      const ring = 1 + 1.8 * sstep(Math.sqrt(ox * ox + oz * oz) / 380);
      return amp * hh * hh * 1.25 * ring;
    }

    /* Lake width beside drops wanders along the lap. */
    const lakeW = new Float32Array(N);
    for (let q = 0; q < N; q++) lakeW[q] = 18 + 16 * (0.5 + 0.5 * Math.sin(q * 0.09 + ph[4]));
    const bottomAbs = ctx.liquid ? ctx.liquid.level - 3 : null;

    /* Pass 1 & 2: splat nodes onto the grid — nearest node, then nearest node
       of a *different* stretch (farther along the lap than the search width). */
    const R2 = T_R * T_R;
    const n1 = new Int32Array(V).fill(-1), d1 = new Float32Array(V).fill(R2);
    const n2 = new Int32Array(V).fill(-1), d2 = new Float32Array(V).fill(R2);
    const SEP = Math.ceil((2 * T_R) / seg);
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 0; q < N; q++) {
        const nd = nodes[q];
        const i0 = lowerBound(xs, nd.x - T_R), i1 = lowerBound(xs, nd.x + T_R);
        const j0 = lowerBound(zs, nd.z - T_R), j1 = lowerBound(zs, nd.z + T_R);
        for (let j = j0; j < j1; j++) {
          const dz = zs[j] - nd.z, dz2 = dz * dz, row = j * nx;
          for (let i = i0; i < i1; i++) {
            const dx = xs[i] - nd.x, dd = dx * dx + dz2, v = row + i;
            if (pass === 0) {
              if (dd < d1[v]) { d1[v] = dd; n1[v] = q; }
            } else if (dd < d2[v]) {
              let di = q - n1[v]; if (di < 0) di = -di; if (N - di < di) di = N - di;
              if (di > SEP) { d2[v] = dd; n2[v] = q; }
            }
          }
        }
      }
    }

    /* One stretch's model at a point, from the node frame refined onto the
       segment toward the point (smooth, no 4 m stair-steps). */
    const st = { h: 0, base: 0, off: 0 };
    function stretch(q, px, pz, far) {
      const a = nodes[q];
      const along = (px - a.x) * sinH[q] - (pz - a.z) * cosH[q];
      const q2 = along >= 0 ? (q + 1) % N : (q - 1 + N) % N;
      const t = Math.min(1, Math.abs(along) / seg);
      const bn = nodes[q2];
      const cx = a.x + (bn.x - a.x) * t, cz = a.z + (bn.z - a.z) * t, cy = a.y + (bn.y - a.y) * t;
      const h = a.h + SP.wrapAngle(bn.h - a.h) * t;
      const sb = sinB[q] + (sinB[q2] - sinB[q]) * t;
      const off = (px - cx) * Math.cos(h) + (pz - cz) * Math.sin(h);
      const side = off < 0 ? 0 : 1, ao = off < 0 ? -off : off;
      const oc = off < -VERGE_OUT ? -VERGE_OUT : (off > VERGE_OUT ? VERGE_OUT : off);
      const base = cy - oc * sb - TUCK;
      const P = prof[side];
      const dw = P.dropW[q] + (P.dropW[q2] - P.dropW[q]) * t;
      const rampN = sstep((ao - T_D0) / T_BLEND);
      let near = base, ramp = rampN;
      if (dw > 0) {
        const cs = P.cliff[q] + (P.cliff[q2] - P.cliff[q]) * t;
        const bottom = Math.min(bottomAbs === null ? cy - 14 : bottomAbs, base - 3);
        const fall = sstep((ao - cs) / CLIFF_W);
        near = base + (bottom - base) * fall * dw;
        const lw = lakeW[q] + (lakeW[q2] - lakeW[q]) * t;
        const rampD = sstep((ao - cs - lw) / LAKE_RISE);
        ramp = rampN + (rampD - rampN) * dw;
      }
      st.h = near + (far - near) * ramp;
      st.base = base;
      st.off = off;
    }

    const H = new Float32Array(V), low = new Float32Array(V);
    const kern = (dd) => { const u = 1 - dd / R2; return (u * u) / ((dd + 1) * (dd + 1)); };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const v = j * nx + i, px = xs[i], pz = zs[j];
        const far = regional(px, pz) + hills(px, pz);
        const q1 = n1[v];
        if (q1 < 0) { H[v] = far; continue; }
        stretch(q1, px, pz, far);
        let h = st.h;
        const base1 = st.base, off1 = st.off;
        if (n2[v] >= 0) {
          const w1 = kern(d1[v]), w2 = kern(d2[v]);
          stretch(n2[v], px, pz, far);
          h = (w1 * h + w2 * st.h) / (w1 + w2);
        }
        // Beside its own road the ground never rises above the tucked level,
        // whatever a neighbouring stretch pulls toward.
        if (Math.abs(off1) < VERGE_OUT && h > base1) h = base1;
        H[v] = h;
        low[v] = base1 - h;
      }
    }

    /** Terrain height exactly as drawn (same triangles), for placing things. */
    function groundAt(x, z) {
      let i = lowerBound(xs, x) - 1, j = lowerBound(zs, z) - 1;
      if (i < 0) i = 0; else if (i > nx - 2) i = nx - 2;
      if (j < 0) j = 0; else if (j > nz - 2) j = nz - 2;
      const fx = clamp01((x - xs[i]) / (xs[i + 1] - xs[i])), fz = clamp01((z - zs[j]) / (zs[j + 1] - zs[j]));
      const a = H[j * nx + i], bb = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
      if (((i + j) & 1) === 0) return fx >= fz ? a + fx * (bb - a) + fz * (d - bb) : a + fz * (c - a) + fx * (d - c);
      return fx + fz <= 1 ? a + fx * (bb - a) + fz * (c - a) : d + (1 - fx) * (c - d) + (1 - fz) * (bb - d);
    }

    /* Colours: two ground tones in broad patches, rock on steep faces and
       cliffs, a wet bed under the liquid, hilltops a touch lighter. */
    const pal = ctx.pal;
    const liquidLevel = ctx.liquid ? ctx.liquid.level : -Infinity;
    const colors = new Float32Array(V * 3);
    const k = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const v = j * nx + i, px = xs[i], pz = zs[j], h = H[v];
        const m = 0.5 + 0.5 * Math.sin(px * 0.023 + pz * 0.011 + ph[5]) * Math.sin(pz * 0.019 - px * 0.007 + ph[6]);
        k.copy(pal.gA).lerp(pal.gB, sstep(m));
        const hx = H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)];
        const hz = H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i];
        const wx = xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)], wz = zs[Math.min(nz - 1, j + 1)] - zs[Math.max(0, j - 1)];
        const grad = Math.sqrt((hx / wx) * (hx / wx) + (hz / wz) * (hz / wz));
        const rocky = Math.max(sstep((grad - 0.75) / 0.6), sstep((low[v] - 1.2) / 3));
        if (rocky > 0) k.lerp(pal.rock, rocky);
        if (h < liquidLevel + 0.6) k.lerp(pal.bed, sstep((liquidLevel + 0.6 - h) / 1.6));
        const lift = 1 + Math.max(-0.08, Math.min(0.1, (h - regional(px, pz)) / 60)) + (hash01(v) - 0.5) * 0.06;
        colors[v * 3] = k.r * lift; colors[v * 3 + 1] = k.g * lift; colors[v * 3 + 2] = k.b * lift;
      }
    }

    /* Tiles: T_TILE² vertices each, sharing their border rows. Cells
       alternate their diagonal (a checker), which groundAt mirrors. */
    const mat = NK.art.mat.lambertV();
    const tiles = [];
    for (let tj = 0; tj < nz - 1; tj += T_TILE - 1) {
      for (let ti = 0; ti < nx - 1; ti += T_TILE - 1) {
        const i1 = Math.min(nx - 1, ti + T_TILE - 1), j1 = Math.min(nz - 1, tj + T_TILE - 1);
        const w = i1 - ti + 1, hgt = j1 - tj + 1;
        const P = new Float32Array(w * hgt * 3), Cc = new Float32Array(w * hgt * 3);
        for (let j = tj; j <= j1; j++) {
          for (let i = ti; i <= i1; i++) {
            const lv = (j - tj) * w + (i - ti), v = j * nx + i;
            P[lv * 3] = xs[i]; P[lv * 3 + 1] = H[v]; P[lv * 3 + 2] = zs[j];
            Cc[lv * 3] = colors[v * 3]; Cc[lv * 3 + 1] = colors[v * 3 + 1]; Cc[lv * 3 + 2] = colors[v * 3 + 2];
          }
        }
        const idx = [];
        for (let j = tj; j < j1; j++) {
          for (let i = ti; i < i1; i++) {
            const a = (j - tj) * w + (i - ti), bb = a + 1, c = a + w, d = c + 1;
            if (((i + j) & 1) === 0) idx.push(a, c, d, a, d, bb);
            else idx.push(a, c, bb, bb, c, d);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P, 3));
        g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mat);
        mesh.receiveShadow = ctx.quality.shadows;
        mesh.name = 'terrain';
        root.add(mesh);
        tiles.push(mesh);
      }
    }
    return { groundAt, verts: V, tiles, extent: { minX: xs[0], maxX: xs[nx - 1], minZ: zs[0], maxZ: zs[nz - 1] } };
  }

  /* ── Liquid: one plane at the theme's level (lakes show where ground dips) */
  function buildLiquid(ctx, terrain) {
    const lq = ctx.liquid;
    if (!lq || !terrain) return null;
    const e = terrain.extent;
    const w = e.maxX - e.minX, d = e.maxZ - e.minZ;
    const geo = new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2);
    const tile = lq.kind === 'water' ? 28 : 22;
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / tile, uv.getY(k) * d / tile);
    ctx.owned.geos.push(geo);
    // The texture is painted in the liquid's own colour, so the material stays
    // white. Lava lights itself through the same map: crust dark, gaps hot.
    const tex = liquidTex(lq.kind, lq.color);
    const hot = lq.kind === 'lava';
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, map: tex,
      emissive: hot ? 0xffffff : lq.emissive,
      emissiveMap: hot ? tex : null,
      emissiveIntensity: hot ? 0.7 : 1
    });
    ctx.owned.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((e.minX + e.maxX) / 2, lq.level, (e.minZ + e.maxZ) / 2);
    mesh.receiveShadow = ctx.quality.shadows;
    mesh.name = 'liquid';
    ctx.root.add(mesh);
    const speed = lq.kind === 'water' ? 0.012 : lq.kind === 'lava' ? 0.006 : 0.004;
    return {
      update(t) { tex.offset.set(t * speed, t * speed * 0.6); }
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Road
   * ════════════════════════════════════════════════════════════════════════ */
  function buildRoad(ctx) {
    const { N, L, nodes, owned, root } = ctx;
    const rt = roadTexture(ctx.theme);
    const tex = rt.tex;
    if (tex.wrapT !== THREE.RepeatWrapping) { tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true; }
    // Whole tiles per lap, so the paint runs through the start line unbroken.
    const tile = L / Math.max(1, Math.round(L / rt.tile));
    const cols = [-ROAD_HALF, -ROAD_HALF / 2, 0, ROAD_HALF / 2, ROAD_HALF];
    const nc = cols.length, rows = N + 1;
    const P = new Float32Array(rows * nc * 3), T = new Float32Array(rows * nc * 2);
    for (let r = 0; r < rows; r++) {
      const i = r % N;
      const v = (r === N ? L : nodes[i].s) / tile;
      for (let c = 0; c < nc; c++) {
        const p = ctx.P(i, cols[c], 0), k = r * nc + c;
        P[k * 3] = p[0]; P[k * 3 + 1] = p[1]; P[k * 3 + 2] = p[2];
        T[k * 2] = (cols[c] + ROAD_HALF) / (2 * ROAD_HALF); T[k * 2 + 1] = v;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < nc - 1; c++) {
        const a = r * nc + c, b = a + 1, cc = a + nc, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(T, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // The closing row duplicates the first: give both the same normal so the
    // shading has no seam at the start line either.
    const nor = geo.attributes.normal;
    for (let c = 0; c < nc; c++) {
      const a = c, z = N * nc + c;
      const x = nor.getX(a) + nor.getX(z), y = nor.getY(a) + nor.getY(z), zz = nor.getZ(a) + nor.getZ(z);
      const l = Math.hypot(x, y, zz) || 1;
      nor.setXYZ(a, x / l, y / l, zz / l); nor.setXYZ(z, x / l, y / l, zz / l);
    }
    geo.computeBoundingSphere();
    owned.geos.push(geo);
    const mesh = new THREE.Mesh(geo, NK.art.mat.lambert(0xffffff, { map: tex, smooth: true }));
    mesh.receiveShadow = ctx.quality.shadows;
    mesh.name = 'road';
    root.add(mesh);
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Edge dressing: verges, kerbs, fences, walls, drops, rails
   * ════════════════════════════════════════════════════════════════════════ */
  function buildEdges(ctx) {
    const { N, nodes, kinds, prof, railed, kit, pal, theme, owned, root } = ctx;
    const P = ctx.P, Rv = ctx.Rv, Fv = ctx.Fv;
    const UPV = [0, 1, 0];
    const chunkOf = (i) => Math.floor(nodes[i].s / EDGE_CHUNK);
    const nChunks = chunkOf(N - 1) + 1;
    const solid = [], glow = [];
    for (let k = 0; k < nChunks; k++) { solid.push(new Builder()); glow.push(new Builder()); }
    const neon = ctx.voidWorld || kit.beam;           // space: trims and fences glow
    const groundY = (p) => ctx.groundAt(p[0], p[2]);
    const surfY = (i, off) => P(i, off, 0)[1];
    const jit = (i, side, amt) => 1 + (hash01(i * 7 + side * 131) - 0.5) * 2 * amt;
    const out = (sg, i) => { const r = Rv(i); return [r[0] * sg, 0, r[2] * sg]; };

    /* Kerbs mark the verge edge through bends; runs shorter than 3 segments
       are dropped so they never flicker on and off along a wavy straight. */
    const kerbOn = [new Uint8Array(N), new Uint8Array(N)];
    if (!railed) {
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i < N; i++) kerbOn[side][i] = kinds[side][i] === 'verge' && Math.abs(nodes[i].k) >= KERB_K ? 1 : 0;
        for (let i = 0; i < N; i++) {
          if (!kerbOn[side][i] || kerbOn[side][(i - 1 + N) % N]) continue;
          let n = 0; while (n < N && kerbOn[side][(i + n) % N]) n++;
          if (n < 3) for (let q = 0; q < n; q++) kerbOn[side][(i + q) % N] = 0;
        }
      }
    }

    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1;
      const kind = kinds[side], pr = prof[side];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N, B = solid[chunkOf(i)], G = glow[chunkOf(i)];
        const k = kind[i];
        if (k === 'drop') dropFace(B, G, i, j, sg);
        else shoulder(B, i, j, sg, pr);
        if (railed) railParts(B, i, j, sg);
        else if (k === 'wall') wallSegment(B, G, i, j, sg, side);
        else if (k === 'verge') {
          if (kerbOn[side][i]) kerb(B, i, j, sg);
          fence(neon ? G : B, i, j, sg, pr, kind);
        } else trim(neon ? G : B, i, j, sg);
      }
    }

    /** Verge surface out to where the ground takes over (or falls away), with
     *  a skirt down to the drawn ground so its edge never floats. */
    function shoulder(B, i, j, sg, pr) {
      const oI = Math.min(VERGE_OUT + 2.2, pr.cliff[i]), oJ = Math.min(VERGE_OUT + 2.2, pr.cliff[j]);
      const dy = (o) => -0.015 - 0.46 * Math.pow(clamp01((o - ROAD_HALF) / (VERGE_OUT + 2.2 - ROAD_HALF)), 1.3);
      const mI = Math.min(ROAD_HALF + 1.8, oI - 0.01), mJ = Math.min(ROAD_HALF + 1.8, oJ - 0.01);
      const stripe = ctx.theme.ground.type === 'sand' || ctx.theme.ground.type === 'snow' ? 1 : (i & 1 ? 0.94 : 1.02);
      const k = shade(pal.shoulder, stripe * jit(i, sg, 0.02));
      const colsI = [ROAD_HALF, mI, oI], colsJ = [ROAD_HALF, mJ, oJ];
      for (let c = 0; c < 2; c++) {
        B.quad(P(i, sg * colsI[c], dy(colsI[c])), P(i, sg * colsI[c + 1], dy(colsI[c + 1])),
               P(j, sg * colsJ[c], dy(colsJ[c])), P(j, sg * colsJ[c + 1], dy(colsJ[c + 1])), k, UPV);
      }
      const eI = P(i, sg * oI, dy(oI)), eJ = P(j, sg * oJ, dy(oJ));
      const gI = Math.min(eI[1] - 0.5, groundY(P(i, sg * (oI + 0.4), 0)) - 0.3);
      const gJ = Math.min(eJ[1] - 0.5, groundY(P(j, sg * (oJ + 0.4), 0)) - 0.3);
      const bI = isFinite(gI) ? gI : eI[1] - 1.4, bJ = isFinite(gJ) ? gJ : eJ[1] - 1.4;
      B.quad([eI[0], bI, eI[2]], eI, [eJ[0], bJ, eJ[2]], eJ, shade(pal.rock, 0.9), out(sg, i));
    }

    /** Sheer side of the road over a drop, down to the drawn ground (or a
     *  slab edge in space), banded: an ink lip, then rock strata. */
    function dropFace(B, G, i, j, sg) {
      const off = sg * (ROAD_HALF + 0.02);
      const tI = surfY(i, off) - 0.02, tJ = surfY(j, off) - 0.02;
      const bot = (n, top) => {
        const g = Math.min(groundY(P(n, sg * (ROAD_HALF + 0.8), 0)), groundY(P(n, sg * (ROAD_HALF + 3), 0)));
        return isFinite(g) ? Math.min(top - 1.2, g - 0.8) : top - 1.6;
      };
      const bI = bot(i, tI), bJ = bot(j, tJ);
      const pI = P(i, off, 0), pJ = P(j, off, 0);
      const at = (p, y) => [p[0], y, p[2]];
      const w = out(sg, i);
      // Ink lip, then two rock strata (the upper third a shade lighter).
      const lipI = tI - 0.3, lipJ = tJ - 0.3;
      const midI = lipI - (lipI - bI) * 0.35, midJ = lipJ - (lipJ - bJ) * 0.35;
      const j5 = jit(i, sg, 0.05);
      B.quad(at(pI, lipI), at(pI, tI), at(pJ, lipJ), at(pJ, tJ), pal.ink, w);
      if (ctx.voidWorld) {
        B.quad(at(pI, bI), at(pI, lipI), at(pJ, bJ), at(pJ, lipJ), shade(pal.ink, 1.6), w);
      } else {
        B.quad(at(pI, midI), at(pI, lipI), at(pJ, midJ), at(pJ, lipJ), shade(pal.rock, j5), w);
        B.quad(at(pI, bI), at(pI, midI), at(pJ, bJ), at(pJ, midJ), shade(pal.rock, 0.82 * j5), w);
      }
      if (ctx.voidWorld) {
        // Glowing underline so the road's edge reads against the void.
        G.quad(at(pI, tI - 0.28), at(pI, tI - 0.08), at(pJ, tJ - 0.28), at(pJ, tJ - 0.08), pal.railA, w);
      }
    }

    /** Open drops: a raised bright lip right at the paving's edge. */
    function trim(B, i, j, sg) {
      const a = ROAD_HALF - 0.32, b = ROAD_HALF + 0.12, h = 0.11;
      const kTop = neon ? pal.railA : pal.trim;
      B.quad(P(i, sg * a, h), P(i, sg * b, h), P(j, sg * a, h), P(j, sg * b, h), kTop, UPV);
      B.quad(P(i, sg * a, -0.02), P(i, sg * a, h), P(j, sg * a, -0.02), P(j, sg * a, h), neon ? pal.railB : pal.ink, out(-sg, i));
      B.quad(P(i, sg * b, -0.3), P(i, sg * b, h), P(j, sg * b, -0.3), P(j, sg * b, h), neon ? pal.railB : pal.ink, out(sg, i));
    }

    /** Red-and-white (theme rail colours) kerb blocks just outside the paving. */
    function kerb(B, i, j, sg) {
      const a = ROAD_HALF, b = ROAD_HALF + 1.15;
      const lerpP = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      for (let half = 0; half < 2; half++) {
        const t0 = half / 2, t1 = (half + 1) / 2;
        const k = ((i * 2 + half) & 1) ? pal.railB : pal.railA;
        const ai = P(i, sg * a, 0.05), bi = P(i, sg * b, 0.075), aj = P(j, sg * a, 0.05), bj = P(j, sg * b, 0.075);
        B.quad(lerpP(ai, aj, t0), lerpP(bi, bj, t0), lerpP(ai, aj, t1), lerpP(bi, bj, t1), k, UPV);
        const fi = P(i, sg * a, -0.02), fj = P(j, sg * a, -0.02);
        B.quad(lerpP(fi, fj, t0), lerpP(ai, aj, t0), lerpP(fi, fj, t1), lerpP(ai, aj, t1), shade(k, 0.7), out(-sg, i));
        const gi = P(i, sg * b, -0.12), gj = P(j, sg * b, -0.12);
        B.quad(lerpP(gi, gj, t0), lerpP(bi, bj, t0), lerpP(gi, gj, t1), lerpP(bi, bj, t1), shade(k, 0.6), out(sg, i));
      }
    }

    /** Low post-and-rail fence along the (funnelled) clamp line. */
    function fence(B, i, j, sg, pr, kind) {
      const fI = pr.fence[i], fJ = pr.fence[j];
      const post = neon ? pal.railA : pal.railB, rail = neon ? pal.railB : pal.post;
      const R = Rv(i), F = Fv(i);
      const pc = P(i, sg * fI, 0.45);
      B.box(pc, R, F, 0.09, 0.47, 0.09, post, shade(post, 1.1));
      // …and the last post of the run where the next segment is not a verge.
      if (kind[j] !== 'verge') B.box(P(j, sg * fJ, 0.45), Rv(j), Fv(j), 0.09, 0.47, 0.09, post, shade(post, 1.1));
      // Two rails, thin boxes run post to post: road face, back face, top.
      [0.46, 0.8].forEach((y) => {
        const fa = (n, f, o, dy) => P(n, sg * (f + o), y + dy);
        B.quad(fa(i, fI, -0.05, -0.06), fa(i, fI, -0.05, 0.06), fa(j, fJ, -0.05, -0.06), fa(j, fJ, -0.05, 0.06), rail, out(-sg, i));
        B.quad(fa(i, fI, 0.05, -0.06), fa(i, fI, 0.05, 0.06), fa(j, fJ, 0.05, -0.06), fa(j, fJ, 0.05, 0.06), shade(rail, 0.8), out(sg, i));
        B.quad(fa(i, fI, -0.05, 0.06), fa(i, fI, 0.05, 0.06), fa(j, fJ, -0.05, 0.06), fa(j, fJ, 0.05, 0.06), shade(rail, 1.1), UPV);
      });
    }

    /* Walls: the theme's kit swept along each run, capped at both ends. */
    function wallSegment(B, G, i, j, sg, side) {
      const pts = kit.prof, roles = kit.roles;
      const hI = 1 + kit.bumps * (hash01(i * 3.1 + side * 17) - 0.5) * 2;
      const hJ = 1 + kit.bumps * (hash01(j * 3.1 + side * 17) - 0.5) * 2;
      const wallC = shade(pal.wall, kit.panels && ((i >> 1) & 1) ? 0.9 : 1);
      const kOf = (role) => {
        const jj = jit(i, sg, kit.jitter);
        switch (role) {
          case 'foot': return pal.ink;
          case 'top': return shade(wallC, 1.16 * jj);
          case 'back': return shade(wallC, 0.78 * jj);
          case 'cream': return shade(pal.cream, jj);
          case 'stone': return shade(mixC(pal.wall, col('#b9b2c8'), 0.45), jj);
          case 'stoneTop': return shade(mixC(pal.wall, col('#d6d0e2'), 0.5), jj);
          default: return shade(wallC, jj);
        }
      };
      const at = (n, p, hs, last) => {
        const q = P(n, sg * (ROAD_HALF + p[0]), p[1] > 0 ? p[1] * hs : p[1]);
        if (last) { const g = groundY(q); if (isFinite(g) && g - 0.3 < q[1]) q[1] = g - 0.3; }
        return q;
      };
      const RI = Rv(i);
      for (let e = 0; e < pts.length - 1; e++) {
        const p0 = pts[e], p1 = pts[e + 1];
        const dW = p1[0] - p0[0], dY = p1[1] - p0[1];
        // Profile edge normal in (outward, up), turned into world space.
        const nW = -dY, nY = dW;
        const w = [RI[0] * sg * nW, nY, RI[2] * sg * nW];
        const last = e + 1 === pts.length - 1;
        B.quad(at(i, p0, hI, false), at(i, p1, hI, last), at(j, p0, hJ, false), at(j, p1, hJ, last), kOf(roles[e]), w);
      }
      const kind = ctx.kinds[side];
      const prevWall = kind[(i - 1 + ctx.N) % ctx.N] === 'wall', nextWall = kind[j] === 'wall';
      if (!prevWall) cap(B, i, hI, pts, kOf('side'), sg, -1);
      if (!nextWall) cap(B, j, hJ, pts, kOf('side'), sg, 1);
      if (kit.merlons) {
        [0.25, 0.75].forEach((t) => {
          const c = lerp3(P(i, sg * (ROAD_HALF + 0.6), 1.85 * hI + 0.3), P(j, sg * (ROAD_HALF + 0.6), 1.85 * hJ + 0.3), t);
          B.box(c, Rv(i), Fv(i), 0.6, 0.3, 0.55, kOf('side'), kOf('top'));
        });
      }
      if (kit.railing) {
        const R = Rv(i), F = Fv(i), dark = shade(pal.wall, 1.3), tip = col('#b98cff');
        B.box(P(i, sg * (ROAD_HALF + 0.3), 1.2), R, F, 0.07, 0.75, 0.07, dark);
        B.box(P(i, sg * (ROAD_HALF + 0.3), 2.02), R, F, 0.11, 0.08, 0.11, tip);
        [1.2, 1.78].forEach((y) => {
          const aI = P(i, sg * (ROAD_HALF + 0.3), y - 0.05), bI = P(i, sg * (ROAD_HALF + 0.3), y + 0.05);
          const aJ = P(j, sg * (ROAD_HALF + 0.3), y - 0.05), bJ = P(j, sg * (ROAD_HALF + 0.3), y + 0.05);
          B.quad(aI, bI, aJ, bJ, dark, out(-sg, i));
          B.quad(aI, bI, aJ, bJ, dark, out(sg, i));
        });
      }
      if (kit.beam) {
        // Energy wall: a solid glowing band over a dark base, bright top line.
        const band = pal.wall, top = mixC(pal.wall, col('#ffffff'), 0.6);
        const aI = P(i, sg * (ROAD_HALF + 0.25), 0.26), bI = P(i, sg * (ROAD_HALF + 0.25), 1.25);
        const aJ = P(j, sg * (ROAD_HALF + 0.25), 0.26), bJ = P(j, sg * (ROAD_HALF + 0.25), 1.25);
        G.quad(aI, bI, aJ, bJ, band, out(-sg, i));
        G.quad(aI, bI, aJ, bJ, shade(band, 0.7), out(sg, i));
        const cI = P(i, sg * (ROAD_HALF + 0.25), 1.4), cJ = P(j, sg * (ROAD_HALF + 0.25), 1.4);
        G.quad(bI, cI, bJ, cJ, top, out(-sg, i));
        G.quad(bI, cI, bJ, cJ, top, out(sg, i));
      }
    }

    function cap(B, n, hs, pts, k, sg, dir) {
      const F = Fv(n), w = [F[0] * dir, 0, F[2] * dir];
      const ring = pts.map((p, e) => {
        const q = P(n, sg * (ROAD_HALF + p[0]), p[1] > 0 ? p[1] * hs : p[1]);
        if (e === pts.length - 1) { const g = groundY(q); if (isFinite(g) && g - 0.3 < q[1]) q[1] = g - 0.3; }
        return q;
      });
      const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length, a[2] + q[2] / ring.length], [0, 0, 0]);
      for (let e = 0; e < ring.length - 1; e++) B.triW(c, ring[e], ring[e + 1], k, w);
      B.triW(c, ring[ring.length - 1], ring[0], k, w);
    }

    /* No-Fail rails: posts and the back/top of the band here; the striped
       face itself is a textured ribbon (below) so the stripes stay crisp. */
    function railParts(B, i, j, sg) {
      const R = Rv(i), F = Fv(i);
      B.box(P(i, sg * (ROAD_HALF + 0.42), 0.2), R, F, 0.08, 0.62, 0.08, col('#5d5a73'));
      const inner = ROAD_HALF + 0.12, backO = ROAD_HALF + 0.26;
      const topI = P(i, sg * inner, 0.92), topJ = P(j, sg * inner, 0.92);
      const tbI = P(i, sg * backO, 0.92), tbJ = P(j, sg * backO, 0.92);
      B.quad(topI, tbI, topJ, tbJ, shade(pal.railB, 0.96), UPV);
      B.quad(P(i, sg * backO, 0.3), tbI, P(j, sg * backO, 0.3), tbJ, shade(pal.railA, 0.75), out(sg, i));
      B.quad(P(i, sg * inner, 0.3), P(i, sg * backO, 0.3), P(j, sg * inner, 0.3), P(j, sg * backO, 0.3), pal.ink, [0, -1, 0]);
    }

    const solidMat = NK.art.mat.lambertV();
    const glowMat = NK.art.mat.basic(0xffffff, { vertexColors: true });
    for (let k = 0; k < nChunks; k++) {
      [[solid[k], solidMat], [glow[k], glowMat]].forEach((pair) => {
        if (pair[0].empty) return;
        const geo = pair[0].geometry();
        owned.geos.push(geo);
        const m = new THREE.Mesh(geo, pair[1]);
        m.castShadow = ctx.quality.shadows && pair[1] === solidMat;
        m.receiveShadow = ctx.quality.shadows && pair[1] === solidMat;
        m.name = 'edges';
        root.add(m);
      });
    }

    if (railed) buildRailBands(ctx);
  }

  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /** The striped face of the No-Fail rails: a closed textured ribbon per side,
   *  lightly self-lit so it stays bright on every theme, day or night. */
  function buildRailBands(ctx) {
    const { N, L, nodes, owned, root, theme } = ctx;
    const tex = railTexture(theme);
    if (tex.wrapS !== THREE.RepeatWrapping) { tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true; }
    const tile = L / Math.max(1, Math.round(L / 4));
    const mat = new THREE.MeshLambertMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: theme.night ? 0.55 : 0.22
    });
    owned.mats.push(mat);
    [-1, 1].forEach((sg) => {
      const P = new Float32Array((N + 1) * 2 * 3), T = new Float32Array((N + 1) * 2 * 2);
      for (let r = 0; r <= N; r++) {
        const i = r % N, u = (r === N ? L : nodes[i].s) / tile;
        const a = ctx.P(i, sg * (ROAD_HALF + 0.12), 0.3), b = ctx.P(i, sg * (ROAD_HALF + 0.12), 0.92);
        P.set(a, r * 6); P.set(b, r * 6 + 3);
        T[r * 4] = u; T[r * 4 + 1] = 0; T[r * 4 + 2] = u; T[r * 4 + 3] = 1;
      }
      const idx = [];
      for (let r = 0; r < N; r++) {
        const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
        // Faces the road: the left rail faces right, the right rail left.
        if (sg > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(T, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      owned.geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = ctx.quality.shadows;
      m.name = 'rail';
      root.add(m);
    });
  }

  /* ── Road-following decal patches (pads, start band, grid marks) ──────────
   * Rows every `step` metres from s0 to s1, columns at x0..x1, banked like
   * the road and lifted `lift` above it. UV: u across (0 = left), v along
   * (0 = back, 1 = front), so a texture's "up" points down the road.
   */
  function patch(ctx, s0, s1, x0, x1, lift, step, into) {
    const n = Math.max(1, Math.ceil((s1 - s0) / (step || 1)));
    const base = into.pos.length / 3;
    for (let r = 0; r <= n; r++) {
      const s = s0 + (s1 - s0) * (r / n);
      const fr = ctx.frame(s);
      [x0, x1].forEach((x, c) => {
        into.pos.push(fr.x + fr.cos * x, fr.y - x * fr.sinB + lift, fr.z + fr.sin * x);
        into.uv.push(c, r / n);
      });
    }
    for (let r = 0; r < n; r++) {
      const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
      into.idx.push(a, b, c, b, d, c);
    }
  }

  function patchGeometry(into) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(into.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(into.uv, 2));
    g.setIndex(into.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  const decalMat = (opts) => new THREE.MeshLambertMaterial(Object.assign({
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  }, opts));

  /* ════════════════════════════════════════════════════════════════════════
   *  Start area: checker band, grid slots, gantry
   * ════════════════════════════════════════════════════════════════════════ */
  function buildStartArea(ctx) {
    const { owned, root } = ctx;
    const A = NK.art;
    installFrame(ctx);

    // Checker band across the line — a patch, so it banks with the road.
    const band = { pos: [], uv: [], idx: [] };
    patch(ctx, -1.6, 1.6, -ROAD_HALF, ROAD_HALF, 0.02, 0.8, band);
    const bandGeo = patchGeometry(band);
    const bandMat = decalMat({ map: A.tex.checker(12, 2) });
    owned.geos.push(bandGeo); owned.mats.push(bandMat);
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.receiveShadow = ctx.quality.shadows;
    root.add(bandMesh);

    // Painted grid slots: a bar ahead of each kart and short side ticks.
    const B = new Builder(), white = col(ctx.theme.road.edge);
    for (let k = 0; k < C.RACERS; k++) {
      const row = Math.floor(k / 2), c = k % 2;
      const s = -(4 + row * 6 + c * 3) + 1.9, x = C.laneX(c === 0 ? 1 : 3);
      const q = (ss, xx) => { const f = ctx.frame(ss); return [f.x + f.cos * xx, f.y - xx * f.sinB + 0.018, f.z + f.sin * xx]; };
      const rect = (sa, sb, xa, xb) => B.quad(q(sa, xa), q(sa, xb), q(sb, xa), q(sb, xb), white, [0, 1, 0]);
      rect(s - 0.18, s, x - 1.25, x + 1.25);
      rect(s - 1.5, s, x - 1.25, x - 1.07);
      rect(s - 1.5, s, x + 1.07, x + 1.25);
    }
    const slotsGeo = B.geometry();
    const slotsMat = decalMat({ vertexColors: true });
    owned.geos.push(slotsGeo); owned.mats.push(slotsMat);
    root.add(new THREE.Mesh(slotsGeo, slotsMat));

    // Gantry over the line, lights facing the grid.
    let gantry = null;
    if (typeof A.startGantry === 'function') {
      try { gantry = A.startGantry(2 * (ROAD_HALF + 1.2)); } catch (e) { warnOnce('gantry', 'NK.world: startGantry failed (' + e.message + ')'); }
    } else warnOnce('gantry', 'NK.world: NK.art.startGantry missing (no gantry over the line yet)');
    if (gantry) {
      const f = ctx.frame(0);
      gantry.position.set(f.x, f.y, f.z);
      gantry.rotation.set(0, -f.h + Math.PI, 0);
      root.add(gantry);
    }
    return { gantry };
  }

  /** ctx.frame(s): a plain-number centreline sample (one reused object) for
   *  the builders — { x, y, z, h, bank, k, cos, sin, sinB }. */
  function installFrame(ctx) {
    if (ctx.frame) return;
    const o = {};
    ctx.frame = (s) => {
      SP.sample(ctx.loop, s, o);
      o.cos = Math.cos(o.h); o.sin = Math.sin(o.h); o.sinB = Math.sin(o.bank);
      return o;
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Features: boxes, coins, pads, boost pads, ramps, hazards
   * ════════════════════════════════════════════════════════════════════════ */
  function buildFeatures(ctx) {
    const { track, L, railed, owned, root, theme } = ctx;
    const A = NK.art;
    installFrame(ctx);
    const F = track.features || {};
    const sOf = (frac) => U.mod(frac * L, L);

    /* Resolved feature lists in metres (DESIGN §10.4). */
    const itemRows = (F.itemRows || []).map((r) => ({ s: sOf(r.at), lanes: r.lanes.slice() }));
    const allLanes = []; for (let l = 0; l < C.LANE_COUNT; l++) allLanes.push(l);
    const padRows = (F.padRows || []).map((r) => ({ s: sOf(r.at), lanes: railed ? allLanes.slice() : r.lanes.slice(), len: PAD_LEN }));
    const boostPads = (F.boostPads || []).map((r) => ({ s: sOf(r.at), lanes: r.lanes.slice(), len: BOOST_LEN }));
    const ramps = (F.ramps || []).map((r) => {
      const spec = C.JUMPS[r.kind] || C.JUMPS.jump;
      return { s: sOf(r.at), kind: r.kind, lanes: r.lanes.slice(), len: spec.rampLength,
        rampHeight: spec.rampHeight, flightLength: r.flightLength || spec.flightLength,
        peakHeight: r.peakHeight || spec.peakHeight };
    });
    const coins = [];
    (F.coins || []).forEach((c) => {
      const s0 = c.from * L;
      const len = U.mod(c.to * L - s0, L);
      const n = Math.max(1, Math.floor(len / COIN_GAP) + 1);
      for (let k = 0; k < n; k++) coins.push({ s: U.mod(s0 + k * COIN_GAP, L), lane: c.lane, x: C.laneX(c.lane) });
    });
    const hazards = [];
    (F.hazards || []).forEach((h, row) => {
      const size = HAZARD_SIZE[h.kind] || HAZARD_SIZE.block;
      const rampS = Number.isFinite(h.rampAt) ? sOf(h.rampAt) : null;
      const base = { s: rampS !== null && Number.isFinite(h.rampOffset) ? U.mod(rampS + h.rampOffset, L) : sOf(h.at),
                     rampS, jumpObstacle: !!h.jumpObstacle, kind: h.kind, row: row, lanes: h.lanes.slice(), period: h.period || 0,
                     phase: h.phase || 0, name: theme.hazards ? theme.hazards[h.kind] : null,
                     halfWidth: size.halfWidth, halfLength: size.halfLength };
      if (h.kind === 'roller') {
        const x0 = C.laneX(h.lanes[0]), x1 = C.laneX(h.lanes[h.lanes.length - 1]);
        hazards.push(Object.assign(base, { lane: -1, x: (x0 + x1) / 2, x0: x0, x1: x1, xMid: (x0 + x1) / 2,
          halfSpan: Math.abs(x1 - x0) / 2, sweepDir: ctx.mirror ? -1 : 1 }));
      } else {
        h.lanes.forEach((l) => hazards.push(Object.assign({}, base, { lane: l, x: C.laneX(l), x0: C.laneX(l), x1: C.laneX(l) })));
      }
    });

    /* ── Power Boxes & coins: instanced, spinning and bobbing ─────────────── */
    const boxItems = [], boxHandles = [];
    itemRows.forEach((r, ri) => {
      boxHandles[ri] = [];
      r.lanes.forEach((l) => { boxHandles[ri][l] = boxItems.length; boxItems.push({ s: r.s, x: C.laneX(l), lift: BOX_LIFT, phase: ri * 1.3 + l * 0.7 }); });
    });
    const boxSet = instSet(ctx, itemParts('box', owned), boxItems, { spin: 1.4, bob: 0.16, bobRate: 2.2 });
    const coinSet = instSet(ctx, itemParts('coin', owned), coins.map((c, k) => ({ s: c.s, x: c.x, lift: COIN_LIFT, phase: k * 0.45 })),
                            { spin: 3.2, bob: 0.1, bobRate: 3 });
    const handles = {
      boxes: boxHandles.map((row) => row.map((k) => (k === undefined ? undefined : boxSet.handle(k)))),
      coins: coins.map((c, k) => coinSet.handle(k)),
      pads: [], boostPads: [], ramps: [], hazards: []
    };

    /* ── Power Pads and Boost Pads: road-following textured panels ────────── */
    const padTex = padTexture('power'), boostTex = padTexture('boost');
    const padMat = decalMat({ map: padTex, emissive: 0xffffff, emissiveMap: padTex, emissiveIntensity: PAD_GLOW.off, alphaTest: 0.4 });
    const boostMat = decalMat({ map: boostTex, emissive: 0xffffff, emissiveMap: boostTex, emissiveIntensity: 0.6, alphaTest: 0.4 });
    owned.mats.push(padMat, boostMat);
    const panels = (rows, len, mat, list, name) => {
      if (!rows.length) return null;
      const into = { pos: [], uv: [], idx: [] };
      rows.forEach((r) => r.lanes.forEach((l) => {
        const x = C.laneX(l);
        patch(ctx, r.s - len / 2, r.s + len / 2, x - PAD_W / 2, x + PAD_W / 2, 0.03, 1.1, into);
      }));
      const geo = patchGeometry(into);
      owned.geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = ctx.quality.shadows;
      m.name = name;
      root.add(m);
      rows.forEach((r) => list.push({ s: r.s, lanes: r.lanes, mesh: m, material: mat }));
      return m;
    };
    panels(padRows, PAD_LEN, padMat, handles.pads, 'powerPads');
    panels(boostPads, BOOST_LEN, boostMat, handles.boostPads, 'boostPads');

    /* ── Ramps: the art kit's ramp, laid along the road with yaw/pitch/bank ─ */
    ramps.forEach((r, k) => {
      let obj = null;
      if (A.items && typeof A.items.ramp === 'function') {
        try { obj = A.items.ramp(r.lanes, r.kind); } catch (e) { warnOnce('ramp', 'NK.world: items.ramp failed (' + e.message + ')'); }
      } else warnOnce('ramp', 'NK.world: NK.art.items.ramp missing, using plain wedges');
      if (!obj) obj = fallbackRamp(r.lanes, r.kind);
      const centreX = r.lanes.reduce((sum, lane) => sum + C.laneX(lane), 0) / r.lanes.length;
      orientOnRoad(ctx, obj, r.s, centreX, 0);
      obj.name = 'ramp:' + r.kind;
      root.add(obj);
      handles.ramps[k] = obj;
    });

    /* ── Hazards ──────────────────────────────────────────────────────────── */
    const hzRng = U.rng((track.seed ^ 0x4a7a) >>> 0);
    const hz = hazards.map((h, k) => {
      let obj = null;
      const H = A.hazard || {};
      const fn = (h.name && H[h.name]) || H[h.kind + ':' + theme.id];
      if (typeof fn === 'function') {
        try { obj = fn(hzRng); } catch (e) { warnOnce('hz-' + h.name, 'NK.world: hazard ' + h.name + ' failed (' + e.message + ')'); }
      } else warnOnce('hz-' + h.name, 'NK.world: no hazard art "' + h.name + '" yet, using a placeholder');
      if (!obj) obj = fallbackHazard(h.kind, owned);
      const holder = new THREE.Group();
      holder.name = 'hazard:' + h.kind;
      let spinner = null, radius = 1;
      if (h.kind === 'roller' && ROLLS[h.name]) {
        // Roll about the ball's own centre: rotating the ground-level origin
        // would swing the ball through the road (Race Tracks' lesson).
        const bb = new THREE.Box3().setFromObject(obj);
        radius = Math.max(0.3, (bb.max.y - bb.min.y) / 2);
        spinner = new THREE.Group();
        spinner.position.y = radius;
        obj.position.y -= radius;
        spinner.add(obj);
        holder.add(spinner);
      } else holder.add(obj);
      orientOnRoad(ctx, holder, h.s, h.x, 0);
      root.add(holder);
      handles.hazards[k] = obj;
      return { def: h, holder, obj, spinner, radius };
    });

    function update(t, dt, hazardState, hs) {
      boxSet.update(t, dt);
      coinSet.update(t, dt);
      for (let k = 0; k < hz.length; k++) {
        const H = hz[k], d = H.def;
        hazardState(k, t, hs);
        if (d.kind === 'roller') {
          orientOnRoad(ctx, H.holder, d.s, hs.x, 0);
          if (H.spinner) H.spinner.rotation.z = -(hs.x - d.xMid) / H.radius;
        }
        const ud = H.obj.userData;
        if (typeof ud.setState === 'function') ud.setState(hs.active, hs.warn, hs.u);
        else if (d.kind === 'geyser' && ud.fallbackColumn) {
          ud.fallbackColumn.scale.y = hs.active ? 1 : 0.05;
          ud.fallbackColumn.visible = hs.active || hs.warn;
        }
        if (typeof ud.anim === 'function') ud.anim(t, dt);
        else if (ud.anim && typeof ud.anim.update === 'function') ud.anim.update(t, dt);
      }
    }

    return {
      resolved: { itemRows, padRows, boostPads, coins, ramps, hazards },
      handles, padMat, update
    };
  }

  /** Place an object on the road at (s, x): position, yaw, pitch and bank. */
  function orientOnRoad(ctx, obj, s, x, lift) {
    const f = ctx.frame(s);
    obj.position.set(f.x + f.cos * x, f.y - x * f.sinB + lift, f.z + f.sin * x);
    const i = Math.floor(U.mod(s, ctx.L) / ctx.seg) % ctx.N;
    const n0 = ctx.nodes[i], n1 = ctx.nodes[(i + 1) % ctx.N];
    const pitch = Math.atan((n1.y - n0.y) / ctx.seg);
    obj.rotation.set(pitch, -f.h, -f.bank, 'YXZ');
  }

  /**
   * An instanced set of floating items (Power Boxes or coins). Every part is
   * its own InstancedMesh sharing one matrix per item; hidden items get a
   * zero scale and pop back in with a little overshoot when shown again.
   */
  function instSet(ctx, parts, items, o) {
    const n = items.length;
    const meshes = [];
    const base = new Float32Array(n * 3);
    const vis = new Uint8Array(n).fill(1), pop = new Float32Array(n).fill(1);
    installFrame(ctx);
    items.forEach((it, k) => {
      const f = ctx.frame(it.s);
      base[k * 3] = f.x + f.cos * it.x;
      base[k * 3 + 1] = f.y - it.x * f.sinB + it.lift;
      base[k * 3 + 2] = f.z + f.sin * it.x;
    });
    if (n) {
      parts.forEach((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, n);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false;
        im.name = 'items';
        ctx.root.add(im);
        meshes.push(im);
      });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    function update(t, dt) {
      if (!n) return;
      for (let k = 0; k < n; k++) {
        let s = 0;
        if (vis[k]) {
          if (pop[k] < 1) pop[k] = Math.min(1, pop[k] + dt * 3.2);
          const u = pop[k];
          s = u < 1 ? 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2) : 1;   // easeOutBack
        }
        const ph = items[k].phase;
        p.set(base[k * 3], base[k * 3 + 1] + Math.sin(t * o.bobRate + ph) * o.bob, base[k * 3 + 2]);
        q.setFromAxisAngle(up, t * o.spin + ph);
        sc.setScalar(s);
        m.compose(p, q, sc);
        for (let j = 0; j < meshes.length; j++) meshes[j].setMatrixAt(k, m);
      }
      for (let j = 0; j < meshes.length; j++) meshes[j].instanceMatrix.needsUpdate = true;
    }
    update(0, 0);
    return {
      update,
      handle(k) {
        return {
          index: k,
          get visible() { return vis[k] === 1; },
          hide() { vis[k] = 0; },
          show() { if (!vis[k]) { vis[k] = 1; pop[k] = 0; } },
          set(on) { if (on) this.show(); else this.hide(); }
        };
      }
    };
  }

  function fallbackRamp(lanes, kind) {
    const g = new THREE.Group();
    const A = NK.art;
    const spec = C.JUMPS[kind] || C.JUMPS.jump;
    const w = lanes.length * C.LANE_W, h = spec.rampHeight, len = spec.rampLength;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);          // length runs along -Z (forward), depth across
    geo.translate(-w / 2, 0, 0);
    const mesh = A.part(geo, A.mat.toon(kind === 'glide' ? 0x2f9bff : 0xff8a1a), { outline: 0.06 });
    g.add(mesh);
    return g;
  }

  function fallbackHazard(kind, owned) {
    const A = NK.art, g = new THREE.Group();
    if (kind === 'block') g.add(A.part(new THREE.BoxGeometry(2.6, 2.0, 2.2), A.mat.toon(0xb07a3c), { pos: [0, 1.0, 0], outline: 0.07 }));
    else if (kind === 'roller') g.add(A.part(new THREE.IcosahedronGeometry(1.0, 1), A.mat.toon(0x8d6e63), { pos: [0, 1.0, 0], outline: 0.07 }));
    else if (kind === 'puddle') g.add(A.part(new THREE.CylinderGeometry(1, 1, 0.06, 20).scale(1.6, 1, 2.9), A.mat.lambert(0x5b3a1e), { pos: [0, 0.04, 0] }));
    else {
      g.add(A.part(new THREE.CylinderGeometry(1.0, 1.1, 0.25, 16), A.mat.toon(0x3d3440), { pos: [0, 0.12, 0], outline: 0.06 }));
      const column = A.part(new THREE.CylinderGeometry(0.8, 0.8, 6, 12).translate(0, 3, 0), A.mat.glow(0xa82200, 1));
      g.add(column);
      g.userData.fallbackColumn = column;
    }
    return g;
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Scenery
   * ════════════════════════════════════════════════════════════════════════
   * Props from the theme's lists (NK.art.props[name](rng)), landmarks from
   * the track, and the shared set pieces around the start. Every prop is
   * checked against EVERY stretch of road (the spatial index), its own
   * footprint included, and against the props already placed; it must stand
   * on dry, not-too-steep ground (or float, for boats); then it is settled on
   * the terrain as drawn. Static props are welded per material per spatial
   * chunk; up to MAX_ANIMATED keep their own transforms and animate.
   */
  function placeScenery(ctx) {
    const { track, theme, loop, nodes, N, L, seg, root, index, quality } = ctx;
    installFrame(ctx);
    const A = NK.art;
    const seed = (track.seed >>> 0) || 1;
    const rng = U.rng((seed ^ 0x5bd1e995) >>> 0);
    const liquidLevel = ctx.liquid ? ctx.liquid.level : -Infinity;
    const placed = [];
    const occ = new Map();            // 16 m buckets of placed footprints
    const OCC = 16;
    const occKey = (ix, iz) => ix * 73856093 ^ iz * 19349663;
    let serial = 0;

    function occFree(x, z, r) {
      const i0 = Math.floor((x - r) / OCC), i1 = Math.floor((x + r) / OCC);
      const j0 = Math.floor((z - r) / OCC), j1 = Math.floor((z + r) / OCC);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const b = occ.get(occKey(i, j));
          if (!b) continue;
          for (let k = 0; k < b.length; k++) {
            const o = b[k], dx = o[0] - x, dz = o[1] - z, rr = o[2] + r;
            if (dx * dx + dz * dz < rr * rr) return false;
          }
        }
      }
      return true;
    }
    function occAdd(x, z, r) {
      const i0 = Math.floor((x - r) / OCC), i1 = Math.floor((x + r) / OCC);
      const j0 = Math.floor((z - r) / OCC), j1 = Math.floor((z + r) / OCC);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const kk = occKey(i, j);
          let b = occ.get(kk);
          if (!b) { b = []; occ.set(kk, b); }
          b.push([x, z, r]);
        }
      }
    }

    function makeProp(name, band) {
      const fn = (A.props && A.props[name]) || (typeof A[name] === 'function' && name !== 'startGantry' ? A[name] : null);
      const r = U.rng((seed ^ U.hash(name) ^ Math.imul(++serial, 2654435761)) >>> 0);
      if (typeof fn === 'function') {
        try {
          const o = fn(r);
          if (o && o.isObject3D) return o;
        } catch (e) { warnOnce('prop-' + name, 'NK.world: prop "' + name + '" failed: ' + e.message); }
      } else warnOnce('prop-' + name, 'NK.world: no prop "' + name + '" yet, using a placeholder block');
      return placeholder(band);
    }

    const _box = new THREE.Box3();
    /**
     * Try to stand a prop at track-space (s, side, off). Pushes it outward
     * until its footprint clears its own stretch of road; rejects it if that
     * lands it near another stretch, on another prop, in the water (unless it
     * floats) or on a slope too steep to stand on.
     */
    function tryPlace(name, band, s, side, off, o) {
      o = o || {};
      const obj = makeProp(name, band);
      if (o.scale) obj.scale.multiplyScalar(o.scale);
      obj.updateMatrixWorld(true);
      _box.setFromObject(obj);
      if (!isFinite(_box.min.x)) return null;
      const rad = Math.max(0.5, Math.hypot(Math.max(-_box.min.x, _box.max.x), Math.max(-_box.min.z, _box.max.z)));
      const offset = Math.max(off, PROP_CLEAR + rad + 0.5);
      const f = ctx.frame(s);
      const sg = side * ctx.sideSign;
      const x = f.x + f.cos * offset * sg, z = f.z + f.sin * offset * sg;
      const reject = () => { NK.art.disposeTree(obj); return null; };
      if (SP.nearest(index, x, z, PROP_CLEAR + rad) !== null) return reject();
      if (!o.force && !occFree(x, z, rad * 0.8)) return reject();

      /* Ground: sample the drawn terrain over the footprint and stand the prop
         at its LOWEST point, so on a slope the uphill side beds in rather
         than the downhill side floating. Origins are on the ground by
         contract, so anything that hangs in the air (balloons) stays up. */
      let y;
      const water = !!WATER_PROPS[name];
      if (ctx.voidWorld) {
        y = f.y + (o.floatY || 0);
      } else {
        let lo = Infinity, hi = -Infinity;
        const sr = rad * 0.72;
        for (let k = 0; k < 7; k++) {
          const a = (k / 6) * TAU;
          const gx = k === 6 ? x : x + Math.cos(a) * sr, gz = k === 6 ? z : z + Math.sin(a) * sr;
          const g = ctx.groundAt(gx, gz);
          if (g < lo) lo = g; if (g > hi) hi = g;
        }
        const landform = LANDFORMS[name] || obj.userData.embed;
        if (o.force) {
          // Landmarks go where the track says, wet or dry.
          y = Math.max(lo - (landform ? Math.max(0.5, rad * 0.06) : 0.05), water ? liquidLevel : -Infinity);
        } else if (water) {
          if (hi > liquidLevel - 0.6) return reject();
          y = liquidLevel;
        } else {
          if (lo < liquidLevel + 0.25) return reject();
          if (!landform && hi - lo > 0.6 + 0.35 * rad) return reject();
          y = lo - (landform ? Math.max(0.5, rad * 0.06) : 0.05);
        }
      }

      /* Facing: things with a front turn to the road, the rest face anywhere. */
      const faces = o.face || FACE_ROAD[name] || obj.userData.faceRoad;
      obj.position.set(x, y, z);
      if (faces) {
        // Local -Z toward the road, which lies at -sg × right from here.
        obj.rotation.y = Math.atan2(sg * Math.cos(f.h), sg * Math.sin(f.h)) + rng.range(-0.12, 0.12);
      } else {
        obj.rotation.y = rng.range(0, TAU);
      }
      if (!water && !LANDFORMS[name] && !ctx.voidWorld) {
        // A couple of degrees of lean keeps the roadside looking hand-placed.
        obj.rotation.x = rng.range(-0.03, 0.03);
        obj.rotation.z = rng.range(-0.03, 0.03);
      }
      occAdd(x, z, rad * 0.8);
      const rec = { obj, name, band, s: U.mod(s, L), x, z, rad };
      placed.push(rec);
      return rec;
    }

    const dens = (theme.props.density || 1) * (quality.detail === 'low' ? 0.55 : 1);

    /* 1. Landmarks: exactly where the track puts them; if a draft track has
          none yet, spread the theme's landmarks round the lap. */
    const marks = (track.landmarks && track.landmarks.length) ? track.landmarks :
      (theme.landmarks || []).map((name, k, arr) => ({ at: (k + 0.5) / arr.length * 0.9 + 0.05, side: k % 2 ? -1 : 1, off: 95, prop: name }));
    marks.forEach((m) => {
      const s = m.at * L;
      // The track's side is already mirrored by tracks.get; undo sideSign.
      const side = (m.side || 1) * ctx.sideSign;
      const rec = tryPlace(m.prop, 'landmark', s, side, m.off || 60, { force: true, floatY: 40 });
      if (rec) rec.landmark = true;
    });

    /* 2. Set pieces round the start: grandstands on the right of the start
          straight, the pit building opposite, billboards either side. */
    const standSide = 1;
    tryPlace('grandstand', 'set', -28, standSide, PROP_CLEAR + 4, { face: true });
    tryPlace('grandstand', 'set', 14, standSide, PROP_CLEAR + 4, { face: true });
    tryPlace('pit_building', 'set', -18, -standSide, PROP_CLEAR + 5, { face: true });
    tryPlace('billboard', 'set', -70, -standSide, PROP_CLEAR + 2, { face: true });
    tryPlace('billboard', 'set', 48, -standSide, PROP_CLEAR + 2, { face: true });
    [0.33, 0.66].forEach((f) => tryPlace('billboard', 'set', f * L, f < 0.5 ? standSide : -standSide, PROP_CLEAR + 2, { face: true }));

    /* 3. Far props: buildings and landforms in the middle distance. */
    const far = theme.props.far || [];
    if (far.length) {
      for (let i = 0; i < N; i += 8) {
        [-1, 1].forEach((side) => {
          if (!rng.chance(0.55 * dens)) return;
          tryPlace(rng.pick(far), 'far', nodes[i].s + rng.range(0, seg * 8), side, rng.range(62, 250),
                   { floatY: rng.range(20, 110) });
        });
      }
    }

    /* 4. Near props: dense roadside dressing, biased toward the verge. */
    const near = theme.props.near || [];
    if (near.length) {
      for (let i = 0; i < N; i++) {
        [-1, 1].forEach((side) => {
          if (!rng.chance(0.5 * dens)) return;
          const u = rng.next();
          tryPlace(rng.pick(near), 'near', nodes[i].s + rng.range(0, seg), side, PROP_CLEAR + 1 + u * u * 44,
                   { scale: rng.range(0.9, 1.15) });
        });
      }
    }

    /* Animated props: landmarks first, then evenly round the lap. */
    const hasAnim = (o) => typeof o.userData.anim === 'function' || (o.userData.anim && typeof o.userData.anim.update === 'function');
    const cands = placed.filter((p) => hasAnim(p.obj)).sort((a, b) => (b.landmark ? 1 : 0) - (a.landmark ? 1 : 0) || a.s - b.s);
    const live = [];
    const marksFirst = cands.filter((p) => p.landmark), rest = cands.filter((p) => !p.landmark);
    marksFirst.slice(0, MAX_ANIMATED).forEach((p) => live.push(p));
    const room = MAX_ANIMATED - live.length;
    if (room > 0 && rest.length) {
      const step = rest.length / Math.min(room, rest.length);
      for (let k = 0; k < Math.min(room, rest.length); k++) live.push(rest[Math.floor(k * step)]);
    }
    const liveSet = new Set(live);

    /* Weld the rest per material per spatial chunk. */
    const chunks = new Map();
    placed.forEach((p) => {
      // Only the roadside casts: far props never reach the shadow frustum.
      const cast = quality.shadows && p.band !== 'far';
      p.obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = cast && !o.userData.outline && !(o.material && o.material.transparent);
        o.receiveShadow = false;
      });
      if (liveSet.has(p)) { root.add(p.obj); return; }
      p.obj.traverse((o) => { delete o.userData.keep; });
      delete p.obj.userData.anim;
      const key = Math.floor(p.x / PROP_CHUNK) + ',' + Math.floor(p.z / PROP_CHUNK);
      let g = chunks.get(key);
      if (!g) { g = new THREE.Group(); chunks.set(key, g); }
      g.add(p.obj);
    });
    let meshes = 0;
    chunks.forEach((g) => {
      const merged = A.mergeByMaterial(g);
      merged.name = 'scenery';
      root.add(merged);
      meshes += merged.children.length;
    });

    return {
      count: placed.length,
      animated: live.length,
      meshes,
      update(t, dt) {
        for (let k = 0; k < live.length; k++) {
          const an = live[k].obj.userData.anim;
          if (typeof an === 'function') an(t, dt);
          else if (an) an.update(t, dt);
        }
      }
    };
  }

  /** Grey stand-in for a prop that is not in the catalog yet (DESIGN §9.4). */
  function placeholder(band) {
    const s = band === 'landmark' ? 10 : band === 'far' ? 7 : band === 'set' ? 5 : 1.6;
    const g = new THREE.Group();
    g.add(NK.art.partV(new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0), 0x9a9aa6, { lambert: true }));
    return g;
  }

  return {
    build,
    // Shared numbers other modules may want without reaching into NK.C.
    ROAD_HALF, VERGE_OUT, PROP_CLEAR, CLAMP, FALL_AT
  };
})();
