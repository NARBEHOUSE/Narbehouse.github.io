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
  const COIN_GAP = C.COIN_GAP;   // metres between coins in a line
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
  const ROLLS = { hay_roll: 1, gumball: 1, snowball: 1, tumbleweed: 1, rolling_boulder: 1, meteor: 1, coconut: 1, thunder_ball: 1,
    pufferfish: 1, rolling_log: 1, bouncy_ball: 1, circus_ball: 1, rolling_tire: 1, oil_drum: 1 };

  /* ── Scenery ──────────────────────────────────────────────────────────── */
  /** Props that belong on the liquid surface, not on dry land. */
  const WATER_PROPS = { sailboat: 1, sea_rock: 1, pier: 1 };
  /** Props that hang in the sky at their own height (a prop may also set userData.floats). */
  const FLOATERS = { floating_island: 1, airship: 1, cloud_castle: 1, cloud_bank: 1, sky_whale: 1, sky_castle: 1,
    fish_school: 1, giant_turtle: 1, pterodactyl_flock: 1, pterodactyl: 1, glow_jellyfish: 1, angler_light: 1 };
  /** Height above the road for floating landmarks (metres). */
  const FLOAT_HEIGHT = { sky_whale: 34, sky_castle: -12, giant_turtle: 22 };
  /** Height band above the road for floating far props that keep low (default 20-110 m). */
  const FLOAT_RANGE = { fish_school: [5, 26], pterodactyl_flock: [22, 60] };
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
        } else if (kind === 'balls') {
          // A ball pit: a carpet of bright plastic balls with a shine each.
          const cols = ['#e8483f', '#f4c430', '#2f8fe0', '#3fb35a', '#9a5ce0', '#ff8a1a'];
          for (let i = 0; i < 260; i++) {
            const x = r.range(0, w), y = r.range(0, h), rad = r.range(7, 10);
            g.fillStyle = r.pick(cols);
            g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.55)';
            g.beginPath(); g.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.3, 0, TAU); g.fill();
          }
        } else if (kind === 'cloud') {
          // A sea of cloud seen from above: soft white billows, faint lilac shade.
          for (let i = 0; i < 70; i++) {
            const x = r.range(0, w), y = r.range(0, h), rad = r.range(14, 40);
            for (let ox = -w; ox <= w; ox += w) for (let oy = -h; oy <= h; oy += h) {
              const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
              const shade = r.chance(0.3);
              gr.addColorStop(0, shade ? 'rgba(214,206,240,0.55)' : 'rgba(255,255,255,0.85)');
              gr.addColorStop(1, 'rgba(255,255,255,0)');
              g.fillStyle = gr;
              g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
            }
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
    brick: {
      prof: [[0.02, -0.4], [0.02, 0.2], [0.02, 1.3], [1.0, 1.3], [1.0, -0.6]],
      roles: ['foot', 'side', 'top', 'back'], bumps: 0, jitter: 0.02, panels: true, studs: true
    },
    plain: {
      prof: [[0.02, -0.4], [0.02, 0.2], [0.02, 1.1], [0.8, 1.1], [0.8, -0.6]],
      roles: ['foot', 'side', 'top', 'back'], bumps: 0, jitter: 0.04
    }
  };

  /** Toy-brick wall colours (the 'brick' kit cycles them every two segments). */
  const TOY_BRICKS = ['#e8483f', '#f4c430', '#2f8fe0', '#3fb35a'].map((c) => new THREE.Color(c));

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
      // Sky islands: no terrain sheet, but solid ground on the islands themselves.
      islandWorld: !!(theme.ground && theme.ground.type === 'islands'),
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

    /* Set pieces first: the terrain carves canyons and the road leaves gaps. */
    ctx.pieces = resolvePieces(ctx);
    ctx.look = pieceLookups(ctx);
    ctx.canyons = resolveCanyons(ctx);

    const stats = {};
    const lapT = (k) => { stats[k] = +(performance.now() - t0).toFixed(1); };

    const sky = buildSky(ctx); lapT('sky');
    const terrain = ctx.voidWorld ? null : ctx.islandWorld ? buildIslands(ctx) : buildTerrain(ctx); lapT('terrain');
    ctx.groundAt = terrain ? terrain.groundAt : () => -Infinity;
    const liquid = buildLiquid(ctx, terrain); lapT('liquid');
    buildRoad(ctx); lapT('road');
    buildEdges(ctx); lapT('edges');
    const start = buildStartArea(ctx); lapT('start');
    const features = buildFeatures(ctx); lapT('features');
    const pieceArt = buildSetPieces(ctx); lapT('pieces');
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

    /* Loops bend the drawn road away from the track's centreline, so every
       position lookup goes through the loop first (DESIGN §4.8). */
    const look = ctx.look, hasLoops = ctx.pieces.loops.length > 0;
    const _lp = new THREE.Vector3(), _lt = new THREE.Vector3(), _ln = new THREE.Vector3(), _lr = new THREE.Vector3();
    const _lb = new THREE.Vector3(), _basis = new THREE.Matrix4();

    /** Road surface point at (s, x), banking — and loops — included. */
    function pointAt(s, x, out) {
      const v = out || new THREE.Vector3();
      if (hasLoops) {
        const hit = look.loopHit(s);
        if (hit) {
          look.loopFrame(hit.lp, hit.lp.path.sigmaOf(hit.d), _lp, _lt, _ln, _lr);
          return v.copy(_lp).addScaledVector(_lr, x);
        }
      }
      const f = frameAt(s);
      v.copy(f.pos).addScaledVector(f.right, x);
      v.y -= x * Math.sin(f.bank);
      return v;
    }

    /**
     * Inside a loop: the full pose of a point on the loop's road — position,
     * an orientation whose -Z runs along the road and +Y stands off its
     * surface, and the up/forward/right vectors. Null anywhere else (there
     * the ordinary yaw/pitch/bank frame is exact). Reuses `out` or one object.
     */
    const _pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), up: new THREE.Vector3(),
      forward: new THREE.Vector3(), right: new THREE.Vector3() };
    function loopPose(s, x, out) {
      if (!hasLoops) return null;
      const hit = look.loopHit(s);
      if (!hit) return null;
      const o = out || _pose;
      look.loopFrame(hit.lp, hit.lp.path.sigmaOf(hit.d), _lp, _lt, _ln, _lr);
      o.pos.copy(_lp).addScaledVector(_lr, x || 0);
      o.up.copy(_ln); o.forward.copy(_lt); o.right.copy(_lr);
      _basis.makeBasis(_lr, _ln, _lb.copy(_lt).negate());
      o.quat.setFromRotationMatrix(_basis);
      return o;
    }

    /** Height above the road of a kart at progress p over a gap jump (every
     *  kart takes a gap ramp, so its arc is known: replays use this). */
    function gapLift(p) {
      const gaps = ctx.pieces.gaps;
      for (let k = 0; k < gaps.length; k++) {
        const g = gaps[k], rl = (C.JUMPS[g.kind] || C.JUMPS.jump).rampLength, d = U.mod(p - g.rampS, L);
        if (d > rl + g.flight) continue;
        if (d <= rl) return g.rampHeight * d / rl;
        const t = (d - rl) / g.flight;
        const ty = frameAt(g.takeoff).y + g.rampHeight, ly = frameAt(g.land).y, sy = frameAt(p).y;
        return Math.max(0, ty + (ly - ty) * t + 4 * g.peak * t * (1 - t) - sy);
      }
      return 0;
    }

    /** The road surface's normal at s (a loop's, or the banked road's). */
    function upAt(s, out) {
      const v = out || new THREE.Vector3();
      if (hasLoops) {
        const hit = look.loopHit(s);
        if (hit) { look.loopFrame(hit.lp, hit.lp.path.sigmaOf(hit.d), _lp, _lt, _ln, _lr); return v.copy(_ln); }
      }
      const f = frameAt(s), sb = Math.sin(f.bank);
      _lr.set(f.right.x, -sb, f.right.z);
      _lt.set(f.forward.x, Math.tan(f.pitch), f.forward.z);
      return v.crossVectors(_lr, _lt).normalize();
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
      pieceArt.update(t, dt);
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
      // Set pieces (DESIGN §4.8): loops warp progress and bend the road;
      // gaps have no road; falls are curtains the karts burst through.
      pieces: {
        gaps: ctx.pieces.gaps.map((g) => ({ rampS: g.rampS, takeoff: g.takeoff, end: g.cut1, land: g.land, scene: g.scene, kind: g.kind })),
        loops: ctx.pieces.loops.map((lp) => ({ s0: lp.s0, len: lp.len, arc: lp.path.arc })),
        falls: ctx.pieces.falls.map((fl) => ({ s: fl.s, air: fl.air, style: fl.style })),
        arches: ctx.pieces.arches.map((ar) => ({ s: ar.s, count: ar.count, spacing: ar.spacing }))
      },
      loopPose, upAt, gapLift,
      inLoop: (s) => !!(hasLoops && look.loopHit(s)),
      warpAt: look.warpAt, shiftS: look.shiftS, arcGap: look.arcGap, loopBlend: hasLoops ? look.loopBlend : () => 0,
      inGap: (s) => !!look.gapAt(s), safeProgress: look.safeProgress,
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
    const open = !theme.underwater && !theme.indoors;
    const disc = !open ? null : theme.night ? (ctx.voidWorld ? null : moonDisc(theme)) : sunDisc(theme);
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
    if (!theme.night && open) buildClouds(ctx);

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

    /* A loop's way down passes beside its way up: the ground under its whole
       footprint sinks to road level, easing back into the hills around it. */
    ctx.pieces.loops.forEach((lp) => {
      const base = lp.O.y - TUCK, sh = lp.path.shift;
      const l0 = Math.min(0, sh) - VERGE_OUT, l1 = Math.max(0, sh) + VERGE_OUT, EASE = 24;
      const reach = lp.len + Math.abs(sh) + VERGE_OUT + EASE + 10;
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const dx = xs[i] - lp.O.x, dz = zs[j] - lp.O.z;
          if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
          const f = dx * lp.F.x + dz * lp.F.z, l = dx * lp.R.x + dz * lp.R.z;
          const ox = Math.max(0, -6 - f, f - lp.len - 6), ol = Math.max(0, l0 - l, l - l1);
          const out = Math.sqrt(ox * ox + ol * ol);
          if (out >= EASE) continue;
          const v = j * nx + i;
          if (H[v] > base) H[v] = base + (H[v] - base) * sstep(out / EASE);
        }
      }
    });

    /* Canyons: cells reaching within CANYON_HOLE of a trench are left out of
       the sheet; the trench mesh (buildCanyon) drops its walls and rim strip
       in exactly there. Heights stay as they were, for the rim to follow. */
    const hole = new Uint8Array(V);
    ctx.canyons.forEach((cyn) => {
      const reach = Math.max(cyn.ext[0], cyn.ext[1]) + cyn.hw0 * 2 + CANYON_HOLE + 10;
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          if (Math.abs(xs[i] - cyn.cx) > reach || Math.abs(zs[j] - cyn.cz) > reach) continue;
          if (cyn.local(xs[i], zs[j]).d > -CANYON_HOLE) hole[j * nx + i] = 1;
        }
      }
    });

    /** Terrain height exactly as drawn (same triangles), for placing things;
     *  inside a canyon, the canyon's floor. */
    function groundAt(x, z) {
      for (let c = 0; c < ctx.canyons.length; c++) {
        if (ctx.canyons[c].local(x, z).d > 0) return ctx.canyons[c].floorY;
      }
      return groundRaw(x, z);
    }
    function groundRaw(x, z) {
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
            const v0 = j * nx + i;
            if (hole[v0] || hole[v0 + 1] || hole[v0 + nx] || hole[v0 + nx + 1]) continue;
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
    ctx.groundRaw = groundRaw;
    return { groundAt, groundRaw, verts: V, tiles, extent: { minX: xs[0], maxX: xs[nx - 1], minZ: zs[0], maxZ: zs[nz - 1] } };
  }

  /* ── Liquid: one plane at the theme's level (lakes show where ground dips) */
  function buildLiquid(ctx, terrain) {
    const lq = ctx.liquid;
    if (!lq || !terrain) return null;
    const e = terrain.extent;
    const w = e.maxX - e.minX, d = e.maxZ - e.minZ;
    const geo = new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2);
    const tile = lq.kind === 'cloud' ? 150 : lq.kind === 'balls' ? 9 : lq.kind === 'water' ? 28 : 22;
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
    const speed = lq.kind === 'water' ? 0.012 : lq.kind === 'lava' ? 0.006 : lq.kind === 'cloud' ? 0.0025 : lq.kind === 'balls' ? 0 : 0.004;
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
      // Gaps have no road; loops draw their own.
      if (ctx.pieces.cut[r % N]) continue;
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

    // Cut segments (gaps, loops) carry no dressing; to the ends of the walls,
    // fences and kerbs either side they look like any other change of kind.
    const cut = ctx.pieces.cut;
    const drawn = kinds.map((list) => list.map((k, i) => (cut[i] ? 'cut' : k)));
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1;
      const kind = drawn[side], pr = prof[side];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N, B = solid[chunkOf(i)], G = glow[chunkOf(i)];
        const k = kind[i];
        if (k === 'cut') continue;
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
      const wallC = kit.studs ? TOY_BRICKS[((i >> 1) + side) % TOY_BRICKS.length]
        : shade(pal.wall, kit.panels && ((i >> 1) & 1) ? 0.9 : 1);
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
      const kind = drawn[side];
      const prevWall = kind[(i - 1 + ctx.N) % ctx.N] === 'wall', nextWall = kind[j] === 'wall';
      if (!prevWall) cap(B, i, hI, pts, kOf('side'), sg, -1);
      if (!nextWall) cap(B, j, hJ, pts, kOf('side'), sg, 1);
      if (kit.studs) {
        // Toy-brick studs along the top.
        [0.25, 0.75].forEach((t) => {
          const c = lerp3(P(i, sg * (ROAD_HALF + 0.5), 1.42), P(j, sg * (ROAD_HALF + 0.5), 1.42), t);
          B.box(c, Rv(i), Fv(i), 0.24, 0.12, 0.24, shade(wallC, 1.08), shade(wallC, 1.15));
        });
      }
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
        if (ctx.pieces.cut[r]) continue;
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
    const ramps = (F.ramps || []).map((r, k) => {
      const spec = C.JUMPS[r.kind] || C.JUMPS.jump;
      // A gap ramp's lip sits exactly where the road ends (resolvePieces),
      // and it launches every kart whatever its lane: there is no road to miss.
      const gap = ctx.pieces.gaps.find((g) => g.ramp === k) || null;
      return { s: gap ? gap.rampS : sOf(r.at), kind: r.kind, lanes: r.lanes.slice(), len: spec.rampLength,
        rampHeight: spec.rampHeight, flightLength: r.flightLength || spec.flightLength,
        peakHeight: r.peakHeight || spec.peakHeight, gap: gap ? gap.scene : null };
    });
    const coins = [];
    (F.coins || []).forEach((c) => {
      const s0 = c.from * L;
      const len = U.mod(c.to * L - s0, L);
      const path = Array.isArray(c.lane) ? c.lane : [c.lane];
      if (path.length < 2) {
        const n = Math.max(1, Math.floor(len / COIN_GAP) + 1);
        for (let k = 0; k < n; k++) coins.push({ s: U.mod(s0 + k * COIN_GAP, L), lane: path[0], x: C.laneX(path[0]) });
        return;
      }
      // A hopping trail: a short run of coins in each lane of the path, the
      // runs spread evenly along the line with room to change lane between,
      // so collecting them all takes steering, not sitting in one lane.
      const run = (C.COIN_RUN - 1) * COIN_GAP, hop = Math.max(0, (len - path.length * run) / (path.length - 1));
      path.forEach((lane, g) => {
        for (let k = 0; k < C.COIN_RUN; k++) coins.push({ s: U.mod(s0 + g * (run + hop) + k * COIN_GAP, L), lane, x: C.laneX(lane) });
      });
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
      const floats = !!(FLOATERS[name] || obj.userData.floats);
      if (ctx.voidWorld || floats) {
        y = f.y + (FLOAT_HEIGHT[name] !== undefined ? FLOAT_HEIGHT[name] : (o.floatY || 0));
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
      if (!water && !floats && !LANDFORMS[name] && !ctx.voidWorld) {
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

    /* Set pieces (loops, waterfall cliffs) reserve their ground first. */
    (ctx.keepOut || []).forEach((k) => occAdd(k[0], k[1], k[2]));

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
          const name = rng.pick(far), ds = rng.range(0, seg * 8), off = rng.range(62, 250);
          let floatY = ctx.islandWorld ? rng.range(-45, 60) : rng.range(20, 110);
          const band = !ctx.islandWorld && FLOAT_RANGE[name];
          if (band) floatY = band[0] + (floatY - 20) / 90 * (band[1] - band[0]);
          tryPlace(name, 'far', nodes[i].s + ds, side, off, { floatY });
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

  /* ════════════════════════════════════════════════════════════════════════
   *  Set pieces: landscape gaps, loop-de-loops, waterfalls, sky islands
   * ════════════════════════════════════════════════════════════════════════
   * resolvePieces() turns the track's set-piece data into metres and node
   * spans before anything is drawn. `ctx.cut[i]` marks road segments the
   * ordinary road and edge dressing must leave out: 1 = a gap (no road at
   * all: the karts are airborne over it), 2 = a loop (the loop draws its own
   * road). Everything here is placed from the same resolved numbers the
   * race uses, so what is drawn and what is driven can never disagree.
   */
  const CANYON_HOLE = 4;       // terrain vertices this close to a canyon wall are cut away…
  const CANYON_LIP = 12;       // …and a rim strip this wide covers the cut edge
  const CANYON_STRAIGHT = 32;  // the canyon runs dead straight this far either side of the road
  const CANYON_MAX = 420;      // then winds on at most this far,
  const CANYON_KEEP = 48;      // stopping this far short of any other stretch of road

  /** Each landscape's look: wall strata (top first), rim strip colour, bed depth under the liquid. */
  const GAP_SCENES = {
    creek:    { strata: ['#7d9a46', '#8a6a4a', '#a8825c', '#7b5a3c', '#9c7a52'], rim: '#6aa648', depth: 2 },
    inlet:    { strata: ['#e8cf9e', '#d9b27c', '#c4935a', '#e3bf86', '#b88450'], rim: '#ecd8a4', depth: 3 },
    choco:    { strata: ['#8fe3b8', '#f2c48d', '#fff1e0', '#e94f88', '#f2c48d', '#7a4423', '#ffd6e6'], rim: '#9ce6c0', depth: 3 },
    canyon:   { strata: ['#e6b371', '#c8643a', '#e08a4f', '#a54b2c', '#f0b070', '#b95a34'], rim: '#e8bb7c', depth: 3 },
    crevasse: { strata: ['#f2f7ff', '#bfe6ff', '#8fc9ef', '#e8f6ff', '#6aaee0', '#d4efff'], rim: '#f4f8ff', depth: 3 },
    ravine:   { strata: ['#3f6b3a', '#4a3f5c', '#5c4f70', '#3a3048', '#56606a'], rim: '#456f3e', depth: 2 },
    moat:     { strata: ['#4b3c3f', '#3a2a2e', '#2a1d22', '#5a2a1e', '#43302f'], rim: '#4e4043', depth: 3, glow: '#c2410c' },
    gorge:    { strata: ['#4f9a3a', '#6f7f4e', '#8a9a5e', '#5b6b3f', '#9aa070', '#66764a'], rim: '#55a03f', depth: 3 },
    trench:   { strata: ['#2f8c8a', '#1d5f7a', '*#1fa89c', '#163f63', '#10304f', '*#5a44c8', '#0b2440'], rim: '#e6d6a8', floor: 34, bed: '#06182c' },
    dinoriver: { strata: ['#5aa043', '#a07a4a', '#c79a5c', '#8a6040', '#b58a56'], rim: '#6fb04a', depth: 3 },
    tarpit:   { strata: ['#5aa043', '#6b4a32', '#4a3324', '#5a3f2c'], rim: '#7a5a3a', floor: 5, bed: '#141016' },
    ballpit:  { strata: ['#fff4e0', '#e8483f', '#f4c430', '#2f8fe0', '#3fb35a', '#9a5ce0'], rim: '#f4e3c8', depth: 2 },
    street:   { strata: ['#3a3355', '*#c99a2e', '#2c2645', '#3a3355', '*#2ab7d6', '#2c2645', '*#c43c9e', '#3a3355'], rim: '#8a8aa0', floor: 26, bed: '#2a2833' },
    gearpit:  { strata: ['#9a8f86', '#8a6a4a', '#b0703a', '#6e6a70', '#c49a4a', '#5a5660'], rim: '#9a8f86', depth: 3 },
    bumpercars: { strata: ['#e8d0a0', '#e8483f', '#fff2d6', '#2f8fe0', '#f4c430'], rim: '#e8d0a0', floor: 9, bed: '#3b3f8f' },
    void:     { strata: null },
    sky:      { strata: null }
  };

  function resolvePieces(ctx) {
    const { track, nodes, N, L, seg } = ctx;
    const F = track.features || {};
    const cut = new Uint8Array(N);
    const gaps = [], loops = [], falls = [], arches = [];
    (F.ramps || []).forEach((r, k) => {
      if (!r.gap) return;
      const J = C.JUMPS[r.kind] || C.JUMPS.jump;
      // The lip sits on a node, so the road ends exactly where the ramp does.
      const i0 = Math.round(U.mod(r.at * L + J.rampLength, L) / seg) % N;
      const takeoff = i0 * seg;
      const span = Math.max(2, Math.floor((J.flightLength - J.apron) / seg));
      for (let q = 0; q < span; q++) cut[(i0 + q) % N] = 1;
      gaps.push({
        ramp: k, kind: r.kind, scene: r.gap, i0, span, takeoff,
        rampS: U.mod(takeoff - J.rampLength, L), cut1: U.mod(takeoff + span * seg, L),
        land: U.mod(takeoff + J.flightLength, L), half: span * seg / 2, centre: U.mod(takeoff + span * seg / 2, L),
        flight: J.flightLength, peak: J.peakHeight, rampHeight: J.rampHeight
      });
    });
    (track.pieces || []).forEach((p) => {
      if (p.kind === 'loop') {
        const i0 = Math.round(U.mod(p.at * L, L) / seg) % N;
        const n = Math.round(C.LOOP.length / seg), len = n * seg;
        for (let q = 0; q < n; q++) cut[(i0 + q) % N] = 2;
        const nd = nodes[i0], h = nd.h;
        loops.push({
          i0, n, s0: i0 * seg, len, side: p.side || 1,
          path: SP.loopPath({ radius: C.LOOP.radius, entry: C.LOOP.entry, circle: C.LOOP.circle, length: len, shift: C.LOOP.shift, side: p.side || 1 }),
          O: new THREE.Vector3(nd.x, nd.y, nd.z),
          F: new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)),
          R: new THREE.Vector3(Math.cos(h), 0, Math.sin(h))
        });
      } else if (p.kind === 'falls') {
        falls.push({ s: U.mod(p.at * L, L), air: !!p.air, style: p.style || 'water', gate: p.gate || null });
      } else if (p.kind === 'arches') {
        arches.push({ s: U.mod(p.at * L, L), prop: p.prop, count: p.count || 4, spacing: p.spacing || 14 });
      }
    });
    return { cut, gaps, loops, falls, arches };
  }

  /**
   * Lookups the race, camera, items and builders share. Every function takes
   * track progress (any lap, negative on the grid) and wraps it itself.
   */
  function pieceLookups(ctx) {
    const { L, pieces } = ctx;
    const loops = pieces.loops, gaps = pieces.gaps;
    const _o = {}, _t = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3();
    const _m = new THREE.Matrix4();

    function loopHit(p) {
      for (let k = 0; k < loops.length; k++) {
        const d = U.mod(p - loops[k].s0, L);
        if (d < loops[k].len) return { lp: loops[k], d };
      }
      return null;
    }
    /** World point, unit tangent, road normal and right vector at a loop's arc sigma. */
    function loopFrame(lp, sig, outP, outT, outN, outR) {
      const o = lp.path.at(sig, _o);
      outP.copy(lp.O).addScaledVector(lp.F, o.f).addScaledVector(lp.R, o.l);
      outP.y += o.y;
      outT.copy(lp.F).multiplyScalar(o.tf).addScaledVector(lp.R, o.tl); outT.y += o.ty; outT.normalize();
      outN.copy(lp.F).multiplyScalar(o.nf).addScaledVector(lp.R, o.nl); outN.y += o.ny;
      outR.crossVectors(outT, outN).normalize();
      outN.crossVectors(outR, outT).normalize();
    }
    function warpAt(p) {
      if (!loops.length) return 1;
      const hit = loopHit(p);
      return hit ? hit.lp.path.warp(hit.d) : 1;
    }
    /** Progress `metres` of real road (arc) ahead of / behind p — differs from p + metres only around loops. */
    function shiftS(p, metres) {
      if (!loops.length) return p + metres;
      let m = metres;
      for (let guard = 0; guard < 8 && Math.abs(m) > 1e-6; guard++) {
        const hit = loopHit(p);
        if (hit) {
          const path = hit.lp.path, sig2 = path.sigmaOf(hit.d) + m;
          if (sig2 >= 0 && sig2 <= path.arc) return p - hit.d + path.uOf(sig2);
          if (sig2 > path.arc) { m = sig2 - path.arc; p = p - hit.d + hit.lp.len; }
          else { m = sig2; p = p - hit.d - 1e-4; }
          continue;
        }
        let best = null;
        loops.forEach((lp) => {
          const dist = m > 0 ? U.mod(lp.s0 - p, L) : -U.mod(p - (lp.s0 + lp.len), L);
          if (Math.abs(dist) <= Math.abs(m) && (best === null || Math.abs(dist) < Math.abs(best))) best = dist;
        });
        if (best === null) return p + m;
        p += best + (m > 0 ? 1e-4 : -1e-4);
        m -= best + (m > 0 ? 1e-4 : -1e-4);
      }
      return p + m;
    }
    /** Signed real-road distance from a to b (loop arcs measured as driven). */
    function arcGap(a, b) {
      if (loops.length) {
        const ha = loopHit(a), hb = loopHit(b);
        if (ha && hb && ha.lp === hb.lp) return hb.lp.path.sigmaOf(hb.d) - ha.lp.path.sigmaOf(ha.d);
      }
      return U.loopDelta(U.mod(a, L), U.mod(b, L), L);
    }
    /**
     * 0..1: how far into a loop's circle p is (1 on the circle, easing to 0
     * over `ease` metres of road either side). Cameras tighten in with it.
     */
    function loopBlend(p, ease) {
      let best = 0;
      for (let k = 0; k < loops.length; k++) {
        const lp = loops[k], path = lp.path;
        let d = U.mod(p - lp.s0, L);
        if (d > L / 2) d -= L;
        const sig = d < 0 ? d : d >= lp.len ? path.arc + (d - lp.len) : path.sigmaOf(d);
        const c0 = path.sigmaOf(path.entry), c1 = path.sigmaOf(path.entry + path.circle);
        const dist = sig < c0 ? c0 - sig : sig > c1 ? sig - c1 : 0;
        const u = Math.max(0, 1 - dist / (ease || 14));
        best = Math.max(best, u * u * (3 - 2 * u));
      }
      return best;
    }
    /** The gap whose missing road contains p, or null. */
    function gapAt(p) {
      for (let k = 0; k < gaps.length; k++) {
        const g = gaps[k], d = U.mod(p - g.takeoff, L);
        if (d < g.span * ctx.seg) return { g, d };
      }
      return null;
    }
    /** Nearest progress at or after p that has road under it (rescues never land in a gap). */
    function safeProgress(p) {
      const hit = gapAt(p);
      return hit ? p - hit.d + hit.g.span * ctx.seg + 2 : p;
    }
    return { loopHit, loopFrame, warpAt, shiftS, arcGap, gapAt, safeProgress, loopBlend, _t, _n, _r, _m };
  }

  /** Index nodes within r of (x, z) that are NOT within `skip` metres of track position sKeep. */
  function nearOther(ctx, x, z, r, sKeep, skip) {
    const index = ctx.index, size = index.size, R2 = r * r;
    const cx = Math.floor(x / size), cz = Math.floor(z / size), k = Math.ceil(r / size);
    for (let ix = cx - k; ix <= cx + k; ix++) {
      for (let iz = cz - k; iz <= cz + k; iz++) {
        const b = index.map.get(index.key(ix, iz));
        if (!b) continue;
        for (let q = 0; q < b.length; q++) {
          const nd = ctx.nodes[b[q]];
          if (Math.abs(U.loopDelta(sKeep, nd.s, ctx.L)) < skip) continue;
          const dx = nd.x - x, dz = nd.z - z;
          if (dx * dx + dz * dz < R2) return true;
        }
      }
    }
    return false;
  }

  /**
   * A canyon under each terrain gap: a trench running across the road, dead
   * straight beside it and winding beyond, closed with rounded ends wherever
   * it would come near another stretch of road. Described in the gap's own
   * frame: a along the road (+ = the landing side), l across it (+ = right).
   */
  function resolveCanyons(ctx) {
    const out = [];
    if (ctx.voidWorld || ctx.islandWorld) return out;
    installFrame(ctx);
    ctx.pieces.gaps.forEach((g) => {
      const sc = GAP_SCENES[g.scene];
      if (!sc || !sc.strata) return;
      const f = ctx.frame(g.centre);
      const cyn = {
        g, sc, cx: f.x, cy: f.y, cz: f.z,
        F: [f.sin, -f.cos], R: [f.cos, f.sin],
        hw0: g.half,
        // A scene with its own floor (a dry trench, a street, an arena) sits that
        // far below the road; otherwise the bed lies just under the liquid.
        floorY: sc.floor !== undefined ? f.y - sc.floor : (ctx.liquid ? ctx.liquid.level : f.y - 10) - (sc.depth || 3),
        ext: [CANYON_MAX, CANYON_MAX]
      };
      const r = U.rng((ctx.track.seed ^ 0xca17 ^ Math.imul(g.ramp + 1, 977)) >>> 0);
      const ph1 = r.range(0, TAU), ph2 = r.range(0, TAU), A = g.half * 0.35;
      cyn.mid = (l) => A * sstep((Math.abs(l) - CANYON_STRAIGHT) / 60) * Math.sin(l / 55 + ph1);
      const widthBase = (l) => g.half * (1 + 0.22 * sstep((Math.abs(l) - CANYON_STRAIGHT) / 40) * Math.sin(l / 41 + ph2));
      cyn.world = (a, l) => [cyn.cx + cyn.F[0] * a + cyn.R[0] * l, cyn.cz + cyn.F[1] * a + cyn.R[1] * l];
      // March out each side until the trench (with its rim) would come near other road.
      [-1, 1].forEach((sd, k) => {
        for (let l = CANYON_STRAIGHT; l <= CANYON_MAX; l += 6) {
          const m = cyn.mid(sd * l), w = widthBase(sd * l) + CANYON_LIP;
          const near = [-w, 0, w].some((da) => {
            const p = cyn.world(m + da, sd * l);
            return nearOther(ctx, p[0], p[1], CANYON_KEEP, g.centre, g.half + 70);
          });
          if (near) { cyn.ext[k] = Math.max(CANYON_STRAIGHT + 8, l - 24); return; }
        }
      });
      cyn.half = (l) => {
        const e = l < 0 ? cyn.ext[0] : cyn.ext[1], al = Math.abs(l), w = widthBase(l);
        if (al >= e) return 0;
        const into = al - (e - w);
        return into > 0 ? w * Math.sqrt(Math.max(0, 1 - (into / w) * (into / w))) : w;
      };
      /** Canyon coordinates of a world point: { a, l, d } with d > 0 inside the trench. */
      cyn.local = (x, z) => {
        const dx = x - cyn.cx, dz = z - cyn.cz;
        const a = dx * cyn.F[0] + dz * cyn.F[1], l = dx * cyn.R[0] + dz * cyn.R[1];
        const inRange = l > -cyn.ext[0] - CANYON_HOLE && l < cyn.ext[1] + CANYON_HOLE;
        const d = inRange ? cyn.half(l) - Math.abs(a - cyn.mid(l)) : -Infinity;
        return { a, l, d };
      };
      out.push(cyn);
    });
    return out;
  }

  /* ── Set-piece art ─────────────────────────────────────────────────────── */

  /** Falling-water streaks, shared by every waterfall (one scroll drives them all). */
  function waterfallTex() {
    return NK.art.tex.cached('nk-world-waterfall', () => {
      const r = U.rng(9091);
      return NK.art.tex.canvas(64, 256, (g, w, h) => {
        g.fillStyle = 'rgba(150,215,245,0.75)'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) {
          const x = r.range(0, w), y = r.range(0, h), len = r.range(30, 110), wd = r.range(1.5, 4.5);
          g.fillStyle = r.chance(0.6) ? 'rgba(255,255,255,0.85)' : 'rgba(205,238,255,0.8)';
          g.fillRect(x, y, wd, len);
          if (y + len > h) g.fillRect(x, y - h, wd, len);
        }
      }, { repeat: true });
    });
  }

  /** Curtain looks: [texture, scroll speed (+ falls, - rises), opacity]. */
  function curtainLook(style) {
    const T = NK.art.tex;
    if (style === 'water' || !style) return [waterfallTex(), 1.7, 0.72];
    const r = U.rng(U.hash('curtain-' + style));
    const tex = T.cached('nk-world-curtain|' + style, () => T.canvas(128, 256, (g, w, h) => {
      if (style === 'bubbles') {
        g.fillStyle = 'rgba(150,215,245,0.18)'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const x = r.range(0, w), y = r.range(0, h), rad = r.range(3, 11);
          for (let oy = -h; oy <= h; oy += h) {
            g.beginPath(); g.arc(x, y + oy, rad, 0, TAU); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.stroke();
            g.fillStyle = 'rgba(200,240,255,0.25)'; g.fill();
            g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(x - rad * 0.4, y + oy - rad * 0.5, 2, 2);
          }
        }
      } else if (style === 'steam') {
        g.fillStyle = 'rgba(235,235,240,0.12)'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 34; i++) {
          const x = r.range(0, w), y = r.range(0, h), rad = r.range(14, 34);
          for (let oy = -h; oy <= h; oy += h) {
            const gr = g.createRadialGradient(x, y + oy, 0, x, y + oy, rad);
            gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.fillRect(x - rad, y + oy - rad, rad * 2, rad * 2);
          }
        }
      } else if (style === 'hologram') {
        g.fillStyle = 'rgba(30,200,255,0.22)'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(120,240,255,0.55)'; g.fillRect(0, y, w, 2); }
        for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,120,240,0.45)'; g.fillRect(0, r.range(0, h), w, r.range(3, 9)); }
        for (let x = 4; x < w; x += 16) for (let y = 4; y < h; y += 16) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x, y, 2, 2); }
      } else {
        // confetti
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, 0, w, h);
        const cols = ['#ff4f6d', '#ffc21a', '#3fa9ff', '#5fd36a', '#b07cff', '#ff8a1a', '#ffffff'];
        for (let i = 0; i < 220; i++) {
          g.save(); g.translate(r.range(0, w), r.range(0, h)); g.rotate(r.range(0, TAU));
          g.fillStyle = r.pick(cols); g.fillRect(-3, -1.5, 6, 3); g.restore();
        }
      }
    }, { repeat: true }));
    const look = { bubbles: [tex, -1.2, 0.95], steam: [tex, -0.7, 0.6], hologram: [tex, -0.5, 0.9], confetti: [tex, 0.9, 1] };
    return look[style] || look.confetti;
  }

  /**
   * Arches over the road (a fossil ribcage, a coral tunnel, carnival lights):
   * one prop repeated `count` times `spacing` metres apart, each square to
   * the road. The props keep a clear opening over the road (|x| < 12.5 m,
   * 12 m high) so karts and the chase camera pass under.
   */
  function buildArches(ctx, ar, kit) {
    const group = new THREE.Group();
    for (let k = 0; k < ar.count; k++) {
      const obj = kit.setProp(ar.prop);
      if (!obj) return;
      orientOnRoad(ctx, obj, ar.s + k * ar.spacing, 0, -0.05);
      const f = frameCopy(ctx, ar.s + k * ar.spacing);
      [-1, 1].forEach((sd) => ctx.keepOut.push([f.x + f.cos * 16 * sd, f.z + f.sin * 16 * sd, 6]));
      if (obj.userData.anim) { ctx.root.add(obj); kit.live.push(obj); } else group.add(obj);
    }
    if (group.children.length) { const merged = NK.art.mergeByMaterial(group); merged.name = 'arches:' + ar.prop; ctx.root.add(merged); }
  }

  function buildSetPieces(ctx) {
    installFrame(ctx);
    const live = [], scroll = [];
    ctx.keepOut = ctx.keepOut || [];
    const setProp = (name) => {
      const fn = NK.art.props && NK.art.props[name];
      if (typeof fn !== 'function') { warnOnce('set-' + name, 'NK.world: no set-piece prop "' + name + '" yet'); return null; }
      try {
        const o = fn(U.rng((ctx.track.seed ^ U.hash(name) ^ Math.imul(live.length + 7, 2654435761)) >>> 0));
        return o && o.isObject3D ? o : null;
      } catch (e) { warnOnce('set-' + name, 'NK.world: set-piece prop "' + name + '" failed: ' + e.message); return null; }
    };
    const kit = { setProp, live, scroll };
    ctx.canyons.forEach((cyn) => buildCanyon(ctx, cyn));
    ctx.pieces.gaps.forEach((g) => {
      if (ctx.voidWorld) buildGapEnds(ctx, g);
      dressGap(ctx, g, kit);
    });
    ctx.pieces.loops.forEach((lp) => buildLoopArt(ctx, lp));
    ctx.pieces.falls.forEach((fl) => buildFallsArt(ctx, fl, kit));
    ctx.pieces.arches.forEach((ar) => buildArches(ctx, ar, kit));
    if (ctx.islandWorld) buildBridges(ctx);
    return {
      update(t, dt) {
        for (let k = 0; k < live.length; k++) {
          const an = live[k].userData.anim;
          if (typeof an === 'function') an(t, dt);
          else if (an && typeof an.update === 'function') an.update(t, dt);
        }
        for (let k = 0; k < scroll.length; k++) scroll[k].tex.offset.y = (t * scroll[k].speed) % 1;
      }
    };
  }

  /** Point a prop's front (-Z) along world direction (dx, dz). */
  function faceDir(obj, dx, dz) { obj.rotation.y = Math.atan2(-dx, -dz); }

  /**
   * The trench of a terrain gap: rock walls banded in the landscape's strata
   * (horizontal bands, so they line up all the way round), a dark lip, a rim
   * strip over the cut terrain edge and a bed under the liquid. One mesh.
   */
  function buildCanyon(ctx, cyn) {
    const sc = cyn.sc, B = new Builder(), G = new Builder(), raw = ctx.groundRaw || ctx.groundAt;
    // A '*' marks a glowing band: lit windows down a street, luminous coral.
    const strata = sc.strata.map((c) => col(c.replace('*', ''))), glows = sc.strata.map((c) => c[0] === '*');
    const rimC = col(sc.rim), ink = ctx.pal.ink;
    const STEP = 4, BAND = 2.4, bottom = cyn.floorY - 1.5, rimRef = cyn.cy;
    const ls = [];
    for (let l = -cyn.ext[0]; l < cyn.ext[1]; l += STEP) ls.push(l);
    ls.push(cyn.ext[1]);
    const wob = (l, k) => (Math.abs(l) < VERGE_OUT + 4 ? 0 : (hash01(l * 0.37 + k * 91 + cyn.g.ramp * 13) - 0.5) * 1.6);
    const front = ls.map((l) => { const h = cyn.half(l); return [cyn.mid(l) - h - (h > 1 ? wob(l, 1) : 0), l]; });
    const back = ls.map((l) => { const h = cyn.half(l); return [cyn.mid(l) + h + (h > 1 ? wob(l, 2) : 0), l]; });
    const poly = front.concat(back.slice(1, -1).reverse());
    const n = poly.length;
    // Orientation, then each vertex's outward normal in (a, l).
    let area = 0;
    for (let k = 0; k < n; k++) { const p = poly[k], q = poly[(k + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
    const sgn = area > 0 ? 1 : -1;
    const W = poly.map((p) => { const w = cyn.world(p[0], p[1]); return [w[0], 0, w[1]]; });
    const outN = poly.map((p, k) => {
      const a = poly[(k - 1 + n) % n], b = poly[(k + 1) % n];
      let ta = b[0] - a[0], tl = b[1] - a[1];
      const len = Math.hypot(ta, tl) || 1; ta /= len; tl /= len;
      // In (a, l) the outward normal of a CCW outline is (tl, -ta).
      const na = sgn * tl, nl = -sgn * ta;
      return [cyn.F[0] * na + cyn.R[0] * nl, cyn.F[1] * na + cyn.R[1] * nl];
    });
    const tops = poly.map((p, k) => {
      const g = raw(W[k][0], W[k][2]);
      return Math.abs(p[1]) < VERGE_OUT ? g + TUCK - 0.02 : g;
    });
    const at = (k, y) => [W[k][0], y, W[k][2]];
    for (let k = 0; k < n; k++) {
      const q = (k + 1) % n, tA = tops[k], tB = tops[q];
      const inward = [-(outN[k][0] + outN[q][0]), 0, -(outN[k][1] + outN[q][1])];
      // Dark lip, then the strata.
      B.quad(at(k, tA), at(q, tB), at(k, tA - 0.35), at(q, tB - 0.35), ink, inward);
      const yA = tA - 0.35, yB = tB - 0.35;
      const j0 = Math.floor((rimRef - Math.max(yA, yB)) / BAND), j1 = Math.ceil((rimRef - bottom) / BAND);
      for (let j = j0; j <= j1; j++) {
        const hi = rimRef - j * BAND, lo = hi - BAND;
        const aHi = Math.min(yA, hi), aLo = Math.max(bottom, lo), bHi = Math.min(yB, hi), bLo = Math.max(bottom, lo);
        if (aHi <= aLo && bHi <= bLo) continue;
        const si = j <= 0 || strata.length === 1 ? 0 : 1 + ((j - 1) % (strata.length - 1));
        const kc = shade(strata[si], 1 + (hash01(k * 3.3 + j * 7.1) - 0.5) * 0.08);
        (glows[si] && hash01(k * 1.31 + j) > 0.25 ? G : B).quad(at(k, Math.max(aHi, aLo)), at(q, Math.max(bHi, bLo)), at(k, aLo), at(q, bLo), kc, inward);
      }
      // Rim strip over the cut ground edge, following the ground outwards.
      const oA = [W[k][0] + outN[k][0] * CANYON_LIP, W[k][2] + outN[k][1] * CANYON_LIP];
      const oB = [W[q][0] + outN[q][0] * CANYON_LIP, W[q][2] + outN[q][1] * CANYON_LIP];
      const mA = [W[k][0] + outN[k][0] * 5, W[k][2] + outN[k][1] * 5], mB = [W[q][0] + outN[q][0] * 5, W[q][2] + outN[q][1] * 5];
      const kr = shade(rimC, 1 + (hash01(k * 1.7) - 0.5) * 0.06);
      const pM = (p) => [p[0], raw(p[0], p[1]) + 0.05, p[1]];
      B.quad(at(k, tA + 0.03), at(q, tB + 0.03), pM(mA), pM(mB), kr, [0, 1, 0]);
      B.quad(pM(mA), pM(mB), pM(oA), pM(oB), kr, [0, 1, 0]);
    }
    // Bed: strips between the two walls at each station.
    const bed = sc.bed ? col(sc.bed) : shade(strata[strata.length - 1], 0.6);
    for (let i = 0; i + 1 < ls.length; i++) {
      const p = (pt) => { const w = cyn.world(pt[0], pt[1]); return [w[0], cyn.floorY, w[1]]; };
      B.quad(p(front[i]), p(front[i + 1]), p(back[i]), p(back[i + 1]), bed, [0, 1, 0]);
    }
    const geo = B.geometry();
    ctx.owned.geos.push(geo);
    const m = new THREE.Mesh(geo, NK.art.mat.lambertV());
    m.name = 'canyon:' + cyn.g.scene;
    ctx.root.add(m);
    if (!G.empty) {
      const gg = G.geometry(); ctx.owned.geos.push(gg);
      const gm = new THREE.Mesh(gg, NK.art.mat.basic(0xffffff, { vertexColors: true }));
      gm.name = 'canyonGlow:' + cyn.g.scene;
      ctx.root.add(gm);
    }
  }

  /** Open space has no canyon: the road just stops, so give it a lit edge at both lips. */
  function buildGapEnds(ctx, g) {
    const B = new Builder(), G = new Builder(), pal = ctx.pal;
    // The near lip faces into the gap (forward), the far lip back toward it.
    [[g.i0, 1], [(g.i0 + g.span) % ctx.N, -1]].forEach(([i, dir]) => {
      const F = ctx.Fv(i), w = [F[0] * dir, 0, F[2] * dir];
      const a = ctx.P(i, -ROAD_HALF - 0.05, -0.02), b = ctx.P(i, ROAD_HALF + 0.05, -0.02);
      const a2 = ctx.P(i, -ROAD_HALF - 0.05, -0.6), b2 = ctx.P(i, ROAD_HALF + 0.05, -0.6);
      B.quad(a, b, a2, b2, shade(pal.ink, 1.6), w);
      G.quad(ctx.P(i, -ROAD_HALF, -0.08), ctx.P(i, ROAD_HALF, -0.08), ctx.P(i, -ROAD_HALF, -0.3), ctx.P(i, ROAD_HALF, -0.3), pal.railA, w);
    });
    [[B, NK.art.mat.lambertV()], [G, NK.art.mat.basic(0xffffff, { vertexColors: true })]].forEach(([b, mat]) => {
      const geo = b.geometry(); ctx.owned.geos.push(geo);
      ctx.root.add(new THREE.Mesh(geo, mat));
    });
  }

  /**
   * Landscape dressing for each gap, laid out in the gap's frame: a along
   * the road (+ = the landing side), l across it. Positions keep to where a
   * player looks: the far wall either side of the landing, the water just
   * ahead, a big feature further down the canyon.
   */
  const GAP_DRESS = {
    creek: [
      ['lily_pads', 0, -22, 'water'], ['lily_pads', -4, 27, 'water'], ['lily_pads', 5, -50, 'water'],
      ['duck_family', 3, 17, 'water', 'side'], ['stepping_stones', -1, 40, 'water', 'across'],
      ['reed_clump', 'near', -14, 'water'], ['reed_clump', 'far', 13, 'water'], ['reed_clump', 'far', -26, 'water'],
      ['reed_clump', 'near', 30, 'water'], ['watermill', 'far+8', -34, 'rim', 'karts']
    ],
    inlet: [
      ['shipwreck', 8, -27, 'water', 'side'], ['dolphin_pod', 4, 22, 'water', 'side'], ['buoy_bell', -8, 11, 'water'],
      ['sea_arch', 0, 64, 'water', 'side'], ['buoy_bell', 12, -46, 'water']
    ],
    choco: [
      ['choco_falls', 'far', -28, 'water', 'karts', 18], ['choco_falls', 'far', 31, 'water', 'karts', 18],
      ['marshmallow_stones', 10, -14, 'water'], ['marshmallow_stones', -16, 22, 'water'], ['candy_raft', 2, 16, 'water', 'side'],
      ['rock_candy', 'far+6', 15, 'rim'], ['rock_candy', 'near-6', -18, 'rim'], ['rock_candy', 'far+5', -46, 'rim']
    ],
    canyon: [
      ['canyon_falls', 'far', -27, 'water', 'karts', 22], ['natural_arch_red', 0, 74, 'floor', 'side'],
      ['rope_bridge_dangling', 'far', 15, 'rim', 'karts'], ['river_rocks', 6, -10, 'water'], ['river_rocks', -18, 34, 'water']
    ],
    crevasse: [
      ['frozen_falls', 'far', -27, 'water', 'karts', 20], ['frozen_falls', 'far', 29, 'water', 'karts', 20],
      ['icicle_row', 'farlip', -16, 'lip', 'karts'], ['icicle_row', 'farlip', 15, 'lip', 'karts'],
      ['icicle_row', 'nearlip', -14, 'lip', 'fwd'], ['icicle_row', 'nearlip', 14, 'lip', 'fwd'],
      ['ice_floe', 6, -15, 'water'], ['ice_floe', -10, 19, 'water'], ['ice_spire', 18, 40, 'water'], ['ice_spire', -16, -42, 'water']
    ],
    ravine: [
      ['broken_bridge_wood', 'near', 24, 'rim', 'fwd'], ['broken_bridge_wood', 'far', 24, 'rim', 'karts'],
      ['wisp_lights', 0, -20, 'water+0.5'], ['wisp_lights', -3, 34, 'water+0.5'], ['lantern_boat', 3, -36, 'water', 'side'],
      ['twisted_roots', 'far', -16, 'rim', 'karts']
    ],
    moat: [
      ['lava_falls', 'far', -28, 'water', 'karts', 20], ['lava_falls', 'far', 30, 'water', 'karts', 20],
      ['lava_plume', -10, 15, 'water'], ['lava_plume', 12, -19, 'water'], ['lava_plume', 0, 42, 'water'],
      ['chain_bridge_broken', 'far', 12, 'rim', 'karts'], ['obsidian_spire', 20, 46, 'water'], ['obsidian_spire', -18, -44, 'water']
    ],
    gorge: [
      ['canyon_falls', 'far', -30, 'water', 'karts', 22], ['canyon_falls', 'far', 31, 'water', 'karts', 22],
      ['river_rocks', 8, -12, 'water'], ['river_rocks', -14, 26, 'water'], ['mossy_rock', 'far+5', 14, 'rim'], ['jungle_flower', 'near-5', -15, 'rim']
    ],
    void: [['ring_gate_big', 'apex'], ['black_hole', 0, 0, 'road-85'], ['asteroid_cluster', 14, -46, 'road+6'], ['asteroid_cluster', -6, 52, 'road-4']],
    sky: [['floating_island', 6, -58, 'road-26'], ['floating_island', -4, 62, 'road-34']],
    // Wonder and Dream cups. Tall pieces keep 15 m or more off the flight line.
    trench: [
      ['trench_coral', -12, -20, 'floor'], ['trench_coral', 14, 24, 'floor'], ['trench_coral', 28, -42, 'floor'],
      ['bubble_column', 4, -24, 'floor'], ['bubble_column', -18, 30, 'floor'],
      ['glow_jellyfish', -8, 20, 'road-10'], ['glow_jellyfish', 16, -18, 'road-14'], ['glow_jellyfish', 0, 44, 'road-6'],
      ['angler_light', 6, 13, 'road-24', 'side'], ['angler_light', -14, -34, 'road-20', 'side']
    ],
    dinoriver: [
      ['sauropod_wading', 10, 32, 'water', 'side'], ['sauropod_wading', -8, -48, 'water', 'side'],
      ['canyon_falls', 'far', -30, 'water', 'karts', 22], ['river_rocks', 8, -10, 'water'], ['river_rocks', -14, 22, 'water'],
      ['river_ferns', 'near-4', -16, 'rim'], ['river_ferns', 'far+4', 17, 'rim'], ['river_ferns', 'far+4', -22, 'rim'],
      ['pterodactyl', 0, -22, 'road+8'], ['pterodactyl', 14, 36, 'road+14']
    ],
    tarpit: [
      ['tar_bubbles', -6, -4, 'floor'], ['tar_bubbles', 8, 6, 'floor'], ['tar_bubbles', 0, 26, 'floor'], ['tar_bubbles', -4, -30, 'floor'],
      ['tar_bones', 4, -17, 'floor', 'side'], ['tar_bones', -8, 21, 'floor', 'side'],
      ['pterodactyl', 0, 30, 'road+10'], ['river_ferns', 'far+4', 14, 'rim'], ['river_ferns', 'near-4', -15, 'rim']
    ],
    ballpit: [
      ['giant_ball', -6, -12, 'water'], ['giant_ball', 8, 16, 'water'], ['giant_ball', 0, 34, 'water'],
      ['toy_slide', 'far', -20, 'water', 'karts'], ['beach_bucket', 4, 24, 'water', 'side'], ['beach_bucket', -10, -30, 'water']
    ],
    street: [
      ['crosswalk', 0, 0, 'floor', 'across'], ['traffic_car', -9, -14, 'floor', 'across'], ['traffic_car', 7, 10, 'floor', 'back'],
      ['traffic_car', -4, 30, 'floor', 'across'], ['bus_city', 10, -30, 'floor', 'back'], ['traffic_car', 12, -50, 'floor', 'back'],
      ['street_light_low', 'near+3', -18, 'floor', 'fwd'], ['street_light_low', 'far-3', 20, 'floor', 'karts'], ['street_light_low', 'far-3', -40, 'floor', 'karts']
    ],
    gearpit: [
      ['gear_giant', -8, -24, 'water', 'karts'], ['gear_giant', 12, 26, 'water+2', 'karts'],
      ['molten_pour', 'far', -34, 'water', 'karts'], ['molten_pour', 'near', 36, 'water', 'fwd'],
      ['catwalk_broken', 'nearlip', 14, 'lip', 'fwd'], ['catwalk_broken', 'farlip', -15, 'lip', 'karts']
    ],
    bumpercars: [
      ['bumper_car', -6, -10, 'floor'], ['bumper_car', 4, 6, 'floor'], ['bumper_car', 10, -22, 'floor'], ['bumper_car', -12, 18, 'floor'],
      ['bumper_car', 2, 32, 'floor'], ['arena_lights', 'near+2', -16, 'floor', 'fwd'], ['arena_lights', 'far-2', 16, 'floor', 'karts'],
      ['arena_lights', 'far-2', -20, 'floor', 'karts']
    ]
  };

  function dressGap(ctx, g, kit) {
    const list = GAP_DRESS[g.scene];
    if (!list) return;
    const cyn = ctx.canyons.find((c) => c.g === g) || null;
    const f = frameCopy(ctx, g.centre);
    const F = [f.sin, -f.cos], R = [f.cos, f.sin];
    const level = ctx.liquid ? ctx.liquid.level : f.y - 20;
    const raw = ctx.groundRaw || ctx.groundAt;
    const half = (l) => (cyn ? cyn.half(l) : g.half), mid = (l) => (cyn ? cyn.mid(l) : 0);
    const group = new THREE.Group();
    list.forEach((e) => {
      const name = e[0];
      let a, l = e[2] || 0;
      if (cyn && (l < -cyn.ext[0] + 8 || l > cyn.ext[1] - 8)) return;
      if (e[1] === 'apex') {
        // The ring stands where the flight peaks, square to the road.
        const obj = kit.setProp(name);
        if (!obj) return;
        const ty = ctx.frame(g.takeoff).y + g.rampHeight, ly = ctx.frame(g.land).y;
        const mf = frameCopy(ctx, g.takeoff + g.flight / 2);
        obj.position.set(mf.x, (ty + ly) / 2 + g.peak + 0.8, mf.z);
        faceDir(obj, mf.sin, -mf.cos);
        ctx.root.add(obj);
        if (obj.userData.anim) kit.live.push(obj);
        return;
      }
      const spec = String(e[1]);
      const off = parseFloat(spec.replace(/^(far|near|farlip|nearlip)/, '')) || 0;
      if (spec.startsWith('farlip')) a = mid(l) + half(l) - 0.25;
      else if (spec.startsWith('nearlip')) a = mid(l) - half(l) + 0.25;
      else if (spec.startsWith('far')) a = mid(l) + half(l) + (off || -0.4);
      else if (spec.startsWith('near')) a = mid(l) - half(l) + (off || 0.4);
      else a = +e[1];
      const x = f.x + F[0] * a + R[0] * l, z = f.z + F[1] * a + R[1] * l;
      const ySpec = String(e[3] || 'water');
      let y;
      if (ySpec.startsWith('water')) y = level + (parseFloat(ySpec.slice(5)) || 0);
      else if (ySpec === 'floor') y = cyn ? cyn.floorY : level;
      else if (ySpec === 'rim') y = raw(x - F[0] * Math.sign(a) * 1.5, z - F[1] * Math.sign(a) * 1.5) - 0.05;
      else if (ySpec === 'lip') y = raw(x + F[0] * Math.sign(a) * 1.5, z + F[1] * Math.sign(a) * 1.5) - 0.3;
      else if (ySpec.startsWith('road')) y = f.y + (parseFloat(ySpec.slice(4)) || 0);
      else y = +ySpec;
      const obj = kit.setProp(name);
      if (!obj) return;
      // Falls are scaled so their lip meets the rim exactly (measured, so a
      // prop's own backing cliff or pool counts; e[5] is only a fallback).
      if (e[5]) {
        const box = new THREE.Box3().setFromObject(obj), tall = isFinite(box.max.y) ? box.max.y - Math.min(0, box.min.y) : e[5];
        const rim = raw(x + F[0] * 3 * Math.sign(a), z + F[1] * 3 * Math.sign(a));
        obj.scale.setScalar(Math.max(0.4, (rim - y + 0.4) / (tall || e[5])));
      }
      obj.position.set(x, y, z);
      const face = e[4] || 'any';
      if (face === 'karts') faceDir(obj, -F[0], -F[1]);
      else if (face === 'fwd') faceDir(obj, F[0], F[1]);
      else if (face === 'side') faceDir(obj, R[0] * (l < 0 ? 1 : -1), R[1] * (l < 0 ? 1 : -1));
      else if (face === 'across') faceDir(obj, R[0], R[1]);
      else if (face === 'back') faceDir(obj, -R[0], -R[1]);
      else obj.rotation.y = hash01(l * 3.1 + a) * TAU;
      if (obj.userData.anim) { ctx.root.add(obj); kit.live.push(obj); }
      else group.add(obj);
    });
    if (group.children.length) { const merged = NK.art.mergeByMaterial(group); merged.name = 'gapDress:' + g.scene; ctx.root.add(merged); }
  }

  /**
   * The loop's road: the theme's own road texture on a ribbon that follows
   * the loop path, a thick underside so it reads as a solid band from
   * outside, and striped rails with a glowing top line on both edges.
   */
  function buildLoopArt(ctx, lp) {
    const look = ctx.look, path = lp.path, pal = ctx.pal;
    const P = new THREE.Vector3(), T = new THREE.Vector3(), Nn = new THREE.Vector3(), Rr = new THREE.Vector3();
    const rows = Math.ceil(path.arc / 1.25);
    const rt = roadTexture(ctx.theme);
    const cols = [-ROAD_HALF, -ROAD_HALF / 2, 0, ROAD_HALF / 2, ROAD_HALF];
    const nc = cols.length;
    const pos = new Float32Array((rows + 1) * nc * 3), uv = new Float32Array((rows + 1) * nc * 2);
    const frames = [];
    for (let r = 0; r <= rows; r++) {
      const sig = path.arc * r / rows;
      look.loopFrame(lp, sig, P, T, Nn, Rr);
      frames.push({ P: P.clone(), N: Nn.clone(), R: Rr.clone(), T: T.clone() });
      for (let c = 0; c < nc; c++) {
        const k = r * nc + c;
        pos[k * 3] = P.x + Rr.x * cols[c] + Nn.x * 0.01; pos[k * 3 + 1] = P.y + Rr.y * cols[c] + Nn.y * 0.01; pos[k * 3 + 2] = P.z + Rr.z * cols[c] + Nn.z * 0.01;
        uv[k * 2] = (cols[c] + ROAD_HALF) / (2 * ROAD_HALF); uv[k * 2 + 1] = (lp.s0 + sig) / rt.tile;
      }
    }
    const idx = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < nc - 1; c++) {
      const a = r * nc + c, b = a + 1, cc = a + nc, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    ctx.owned.geos.push(geo);
    const road = new THREE.Mesh(geo, NK.art.mat.lambert(0xffffff, { map: rt.tex, smooth: true }));
    road.name = 'loopRoad';
    ctx.root.add(road);

    const B = new Builder(), G = new Builder();
    const E = (fr, x, n) => [fr.P.x + fr.R.x * x + fr.N.x * n, fr.P.y + fr.R.y * x + fr.N.y * n, fr.P.z + fr.R.z * x + fr.N.z * n];
    const vec = (v, s) => [v.x * s, v.y * s, v.z * s];
    const under = shade(pal.wall, 0.75), sideC = shade(pal.wall, 0.9), HW = ROAD_HALF + 0.45;
    for (let r = 0; r < rows; r++) {
      const a = frames[r], b = frames[r + 1];
      B.quad(E(a, -HW, -0.9), E(a, HW, -0.9), E(b, -HW, -0.9), E(b, HW, -0.9), under, vec(a.N, -1));
      const stripe = (Math.floor(r / 2) & 1) ? pal.railA : pal.railB;
      [-1, 1].forEach((sd) => {
        // Slab side, rail faces and cap.
        B.quad(E(a, sd * HW, 0.02), E(a, sd * HW, -0.9), E(b, sd * HW, 0.02), E(b, sd * HW, -0.9), sideC, vec(a.R, sd));
        const ri = sd * (ROAD_HALF + 0.05), ro = sd * HW;
        B.quad(E(a, ri, 0), E(a, ri, 1.15), E(b, ri, 0), E(b, ri, 1.15), stripe, vec(a.R, -sd));
        B.quad(E(a, ro, 0.02), E(a, ro, 1.15), E(b, ro, 0.02), E(b, ro, 1.15), shade(stripe, 0.85), vec(a.R, sd));
        G.quad(E(a, ri, 1.15), E(a, ro, 1.15), E(b, ri, 1.15), E(b, ro, 1.15), pal.railA, vec(a.N, 1));
      });
    }
    [[B, NK.art.mat.lambertV()], [G, NK.art.mat.basic(0xffffff, { vertexColors: true })]].forEach(([bb, mat]) => {
      const g2 = bb.geometry(); ctx.owned.geos.push(g2);
      const m = new THREE.Mesh(g2, mat); m.name = 'loopBand'; ctx.root.add(m);
    });
    // Keep scenery off the loop's footprint.
    for (let r = 0; r <= rows; r += 6) ctx.keepOut.push([frames[r].P.x, frames[r].P.z, ROAD_HALF + 6]);
  }

  /**
   * A waterfall curtain across the road. On the ground it pours from a mossy
   * rock arch the road runs through; in the air (a sky gap) it falls from a
   * floating island across the flight path down into the clouds.
   */
  /** A private copy of ctx.frame(s) (that one object is reused by every call). */
  function frameCopy(ctx, s) { const o = ctx.frame(s); return { x: o.x, y: o.y, z: o.z, h: o.h, sin: o.sin, cos: o.cos, sinB: o.sinB, bank: o.bank }; }

  function buildFallsArt(ctx, fl, kit) {
    const f = frameCopy(ctx, fl.s);
    const F = [f.sin, 0, -f.cos], R = [f.cos, 0, f.sin];
    const at = (a, x, y) => [f.x + F[0] * a + R[0] * x, y, f.z + F[2] * a + R[2] * x];
    const look = curtainLook(fl.style), tex = look[0];
    if (!kit.scroll.some((s) => s.tex === tex)) kit.scroll.push({ tex, speed: look[1] });
    let yTop, yBot, half, aFace;
    if (!fl.air && fl.gate) {
      // A themed gateway frames the curtain (bubble machine, holo gate…).
      const gate = kit.setProp(fl.gate);
      if (gate) {
        gate.position.set(f.x, f.y - 0.05, f.z);
        faceDir(gate, -F[0], -F[2]);
        if (gate.userData.anim) { ctx.root.add(gate); kit.live.push(gate); }
        else ctx.root.add(NK.art.mergeByMaterial(gate));
      }
      [-1, 1].forEach((sd) => ctx.keepOut.push([...at(0, sd * 17, 0).filter((_, k) => k !== 1), 9]));
      yTop = f.y + 12; yBot = f.y + 0.04; half = 12.4; aFace = 0;
    } else if (fl.air) {
      const hit = ctx.look.gapAt(fl.s);
      const g = hit ? hit.g : null;
      let yF = f.y + 8;
      if (g) {
        const ty = ctx.frame(g.takeoff).y + g.rampHeight, ly = ctx.frame(g.land).y;
        const t = clamp01(U.mod(fl.s - g.takeoff, ctx.L) / g.flight);
        yF = ty + (ly - ty) * t + 4 * g.peak * t * (1 - t);
      }
      // The feeding island floats well clear of the flight: its rocky tip
      // hangs about 25 m down, so it sits ~40 m above the karts' path.
      yTop = yF + 40; yBot = (ctx.liquid ? ctx.liquid.level : yF - 70) - 6; half = 17; aFace = 0;
      const isle = kit.setProp('floating_island');
      if (isle) {
        // This island feeds the big curtain: drop any little fall of its own,
        // which would otherwise hang across the road beyond the gap.
        const water = [];
        isle.traverse((o) => { if (o.isMesh && o.material && o.material.map) water.push(o); });
        water.forEach((o) => { if (o.parent) o.parent.remove(o); });
        if (water.length) delete isle.userData.anim;
        isle.scale.setScalar(1.25);
        const p = at(5, 0, yTop + 1.5);
        isle.position.set(p[0], p[1], p[2]);
        faceDir(isle, -F[0], -F[2]);
        ctx.root.add(isle);
        if (isle.userData.anim) kit.live.push(isle);
      }
    } else {
      // Rock arch: stepped crags either side, a stacked lintel high over the
      // road, vines hanging behind the water and plants along the top.
      const B = new Builder(), base = mixC(col(ctx.theme.wall.color), col('#7d7f86'), 0.55);
      const stones = [shade(base, 0.95), shade(base, 0.82), shade(mixC(base, col('#a39a86'), 0.4), 1), shade(base, 0.72)];
      const moss = col('#4d8f3a'), mossDark = col('#3a7430');
      const ground = (x) => { const p = at(0, x, 0); const g = ctx.groundAt(p[0], p[2]); return isFinite(g) ? Math.min(g, f.y) - 1 : f.y - 6; };
      const tops = [];
      [-1, 1].forEach((sd) => {
        [[ROAD_HALF + 5.4, 2.8, 16.8, 5.6], [ROAD_HALF + 10, 4.4, 20, 6.8], [ROAD_HALF + 17, 5.4, 24, 7.4],
          [ROAD_HALF + 25, 6.2, 18.5, 6.6], [ROAD_HALF + 33, 5.8, 12.5, 6]].forEach(([off, hw, top, hd], i) => {
          const g = ground(sd * off), y1 = f.y + top + (hash01(i * 7 + sd) - 0.5) * 2.4, ym = g + (y1 - g) * 0.6;
          const da = (hash01(i * 3 + sd * 5) - 0.5) * 2.4;
          B.box(at(da, sd * off, (g + ym) / 2), R, F, hw, (ym - g) / 2, hd, stones[i % 4], moss);
          B.box(at(da * 0.5 + 0.6, sd * (off + 0.7), (ym + y1) / 2), R, F, hw * 0.76, (y1 - ym) / 2, hd * 0.78, stones[(i + 1) % 4], mossDark);
          tops.push(at(da * 0.5 + 0.6, sd * (off + 0.7), y1));
          ctx.keepOut.push([...at(0, sd * off, 0).filter((_, k) => k !== 1), hw + 5]);
        });
      });
      B.box(at(0, 0, f.y + 13.4), R, F, ROAD_HALF + 9, 2.2, 5.6, stones[0], moss);
      B.box(at(1.2, 0, f.y + 16.4), R, F, ROAD_HALF + 5, 1.2, 4.2, stones[2], mossDark);
      B.box(at(-0.6, 0, f.y + 11.4), R, F, ROAD_HALF + 6, 0.35, 5.2, stones[3], stones[1]);
      // Vines: thin green strands hanging from the lintel, just behind the water.
      for (let k = 0; k < 14; k++) {
        const x = -ROAD_HALF - 4 + (2 * ROAD_HALF + 8) * (k + 0.5) / 14 + (hash01(k * 1.9) - 0.5) * 1.2;
        const len = 2 + 4.5 * hash01(k * 4.3 + 1), w = 0.18 + 0.12 * hash01(k);
        const kc = k % 3 ? moss : col('#6fbf4a');
        B.quad(at(-5.75, x - w, f.y + 11.1), at(-5.75, x + w, f.y + 11.1), at(-5.75, x - w * 0.6, f.y + 11.1 - len), at(-5.75, x + w * 0.6, f.y + 11.1 - len), kc, [-F[0], 0, -F[2]]);
      }
      const geo = B.geometry(); ctx.owned.geos.push(geo);
      ctx.root.add(new THREE.Mesh(geo, NK.art.mat.lambertV()));
      // Plants along the top of the arch and the crags.
      const plants = new THREE.Group(), kinds = ['giant_fern', 'jungle_flower', 'giant_fern', 'bamboo_clump', 'banana_plant'];
      const lintelTop = [-12, -6, 0, 5, 11].map((x) => at(0.5 + (hash01(x) - 0.5) * 3, x, f.y + 17.6));
      tops.concat(lintelTop).forEach((p, k) => {
        const o = kit.setProp(kinds[k % kinds.length]);
        if (!o) return;
        o.position.set(p[0], p[1] - 0.1, p[2]);
        o.rotation.y = hash01(k * 2.7) * TAU;
        plants.add(o);
      });
      if (plants.children.length) { const merged = NK.art.mergeByMaterial(plants); merged.name = 'fallsPlants'; ctx.root.add(merged); }
      yTop = f.y + 15.4; yBot = f.y + 0.04; half = ROAD_HALF + 5.5; aFace = -6;
      // Foam where the curtain hits the road.
      const foam = new Builder();
      foam.quad(at(aFace - 2.6, -half, f.y + 0.07), at(aFace - 2.6, half, f.y + 0.07), at(aFace + 1.2, -half, f.y + 0.07), at(aFace + 1.2, half, f.y + 0.07), col('#ffffff'), [0, 1, 0]);
      const fg = foam.geometry(); ctx.owned.geos.push(fg);
      ctx.root.add(new THREE.Mesh(fg, NK.art.mat.basic(0xffffff, { vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })));
    }
    // The curtain: a gently bulging sheet of scrolling streaks.
    const cols = 6, rowsN = 10, posA = [], uvA = [], idx = [];
    for (let r = 0; r <= rowsN; r++) {
      const v = r / rowsN, y = yTop + (yBot - yTop) * v, bulge = -1.1 * Math.sin(Math.PI * Math.min(1, v * 1.4));
      for (let c = 0; c <= cols; c++) {
        const x = -half + 2 * half * c / cols, p = at(aFace + bulge, x, y);
        posA.push(p[0], p[1], p[2]);
        uvA.push(x / 5, y / 7);
      }
    }
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, cc = a + cols + 1, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    cg.setIndex(idx); cg.computeVertexNormals(); cg.computeBoundingSphere();
    ctx.owned.geos.push(cg);
    const curtain = new THREE.Mesh(cg, NK.art.mat.basic(0xffffff, { map: tex, transparent: true, opacity: look[2], side: 'double', depthWrite: false }));
    curtain.name = 'falls';
    curtain.renderOrder = 3;
    ctx.root.add(curtain);
  }

  /**
   * Sky islands. Islands are the authored spans minus the jump gaps; on them
   * the ground stands just under the road and verges and spreads out into a
   * grassy top (narrowing to the road's edge wherever the edge is a drop),
   * over a rocky underside that hangs down to a point. Everywhere else the
   * road is a bridge (buildBridges) over a sea of cloud.
   */
  function buildIslands(ctx) {
    const { nodes, N, L, seg, track, theme, owned, root } = ctx;
    const cut = ctx.pieces.cut;
    const on = new Uint8Array(N);
    (track.islands || []).forEach((span) => {
      const a = span[0] * L, len = U.mod(span[1] * L - a, L);
      for (let i = 0; i < N; i++) if (U.mod(nodes[i].s - a, L) <= len && cut[i] !== 1) on[i] = 1;
    });
    ctx.onIsland = on;
    // Runs of island nodes, unwrapped across the seam.
    const runs = [];
    let first = 0;
    while (first < N && on[first]) first++;
    for (let q = 1; q <= N; q++) {
      const i = (first + q) % N;
      if (on[i] && !on[(i - 1 + N) % N]) {
        let n = 0; while (n < N && on[(i + n) % N]) n++;
        runs.push({ i0: i, n });
      }
    }
    const hr = U.rng((track.seed ^ 0x15a1d) >>> 0);
    const ph = [hr.range(0, TAU), hr.range(0, TAU), hr.range(0, TAU), hr.range(0, TAU)];
    const width = [new Float32Array(N), new Float32Array(N)], depth = new Float32Array(N);
    runs.forEach((run) => {
      for (let q = 0; q < run.n; q++) {
        const i = (run.i0 + q) % N;
        const ends = Math.min(q, run.n - 1 - q) * seg;
        for (let side = 0; side < 2; side++) {
          const sg = side ? 1 : -1;
          let w;
          if (ctx.kinds[side][i] === 'drop') w = ROAD_HALF + 0.25;
          else {
            const target = VERGE_OUT + 10 + 26 * (0.5 + 0.5 * Math.sin(i * 0.19 + ph[side])) * (0.65 + 0.35 * Math.sin(i * 0.061 + ph[2]));
            w = VERGE_OUT + 2;
            for (let o = VERGE_OUT + 4; o <= target; o += 3) {
              const p = ctx.P(i, sg * o, 0);
              if (nearOther(ctx, p[0], p[2], 30, nodes[i].s, 80)) break;
              w = o;
            }
          }
          if (ends < 30) w = ROAD_HALF + 1.2 + (w - ROAD_HALF - 1.2) * sstep(ends / 30);
          width[side][i] = w;
        }
        const u = (q + 0.5) / run.n;
        depth[i] = 6 + 18 * Math.pow(Math.sin(Math.PI * u), 0.7) * (0.8 + 0.4 * hash01(run.i0 * 3 + 1)) + 3 * Math.sin(i * 0.37 + ph[3]);
      }
    });
    // Smooth widths so edges never zigzag from node to node.
    width.forEach((wArr) => {
      const src = wArr.slice();
      for (let i = 0; i < N; i++) if (on[i]) {
        let acc = 0, cnt = 0;
        for (let k = -2; k <= 2; k++) { const j = (i + k + N) % N; if (on[j]) { acc += src[j]; cnt++; } }
        wArr[i] = acc / cnt;
      }
    });
    for (let side = 0; side < 2; side++) for (let i = 0; i < N; i++) if (ctx.kinds[side][i] === 'drop') width[side][i] = ROAD_HALF + 0.25;

    const top = (i, off) => {
      const oc = Math.max(-VERGE_OUT, Math.min(VERGE_OUT, off)), ao = Math.abs(off);
      const bump = ao > VERGE_OUT + 3 ? 0.9 * sstep((ao - VERGE_OUT - 3) / 8) * (0.5 + 0.5 * Math.sin(off * 0.31 + i * 0.27)) : 0;
      return nodes[i].y - oc * ctx.sinB[i] - TUCK + bump;
    };
    function groundAt(x, z) {
      const q = SP.nearest(ctx.index, x, z, 75);
      if (!q || !on[q.i]) return -Infinity;
      const side = q.off < 0 ? 0 : 1;
      if (Math.abs(q.off) > width[side][q.i]) return -Infinity;
      return top(q.i, q.off);
    }

    const B = new Builder(), Gr = new Builder();
    const gA = col(theme.ground.colors[0]), gB = col(theme.ground.colors[1]);
    const dirt = col('#a07a52'), rock = col('#8f8aa6'), deep = col('#6b6585');
    const P = ctx.P;
    const ringOf = (i) => {
      const wl = width[0][i], wr = width[1][i], D = depth[i], ty = nodes[i].y - TUCK;
      const jit = (k) => (hash01(i * 5.3 + k * 17) - 0.5) * 1.6;
      const yl = ctx.kinds[0][i] === 'drop' ? nodes[i].y + wl * ctx.sinB[i] - 1.6 : top(i, -wl);
      const yr = ctx.kinds[1][i] === 'drop' ? nodes[i].y - wr * ctx.sinB[i] - 1.6 : top(i, wr);
      return [[-wl, yl, 0], [-wl - 0.7, yl - 1.7, 1], [-wl * 0.86 + jit(1), ty - D * 0.36, 2], [-wl * 0.5 + jit(2), ty - D * 0.78, 3], [jit(3), ty - D, 3],
        [wr * 0.5 + jit(4), ty - D * 0.78, 3], [wr * 0.86 + jit(5), ty - D * 0.36, 2], [wr + 0.7, yr - 1.7, 1], [wr, yr, 0]];
    };
    const bandC = [shade(gB, 0.92), dirt, rock, deep];
    const hang = new THREE.Group();
    let hangCount = 0;
    runs.forEach((run) => {
      let prev = null;
      for (let q = 0; q <= run.n; q++) {
        const i = (run.i0 + q) % N;
        const ring = ringOf(i).map((p) => ({ w: P(i, p[0], 0), y: p[1], band: p[2], off: p[0] }));
        ring.forEach((p) => { p.w[1] = p.y; });
        if (prev) {
          const pi = (run.i0 + q - 1) % N;
          for (let k = 0; k < ring.length - 1; k++) {
            const a = prev.ring[k].w, b = prev.ring[k + 1].w, c = ring[k].w, d = ring[k + 1].w;
            const mx = (a[0] + b[0] + c[0] + d[0]) / 4, my = (a[1] + b[1] + c[1] + d[1]) / 4, mz = (a[2] + b[2] + c[2] + d[2]) / 4;
            const ctr = P(pi, 0, 0); ctr[1] = nodes[pi].y - depth[pi] * 0.45;
            const kc = shade(bandC[Math.max(prev.ring[k].band, prev.ring[k + 1].band)], 1 + (hash01(i * 2.1 + k) - 0.5) * 0.1);
            B.quad(a, b, c, d, kc, [mx - ctr[0], my - ctr[1], mz - ctr[2]]);
          }
          // Grass tops beyond the verge, each side.
          [0, 1].forEach((side) => {
            const sg = side ? 1 : -1, w0 = width[side][pi], w1 = width[side][i];
            if (Math.min(w0, w1) < VERGE_OUT + 4.5) return;
            const pts = (n, wv) => [VERGE_OUT - 0.5, VERGE_OUT + 4, (VERGE_OUT + 4 + wv) / 2, wv].map((o) => { const p = P(n, sg * o, 0); p[1] = top(n, sg * o); return p; });
            const A = pts(pi, w0), Bq = pts(i, w1);
            for (let k = 0; k < 3; k++) {
              const m = 0.5 + 0.5 * Math.sin(A[k][0] * 0.05 + A[k][2] * 0.04);
              Gr.quad(A[k], A[k + 1], Bq[k], Bq[k + 1], shade(mixC(gA, gB, m), 1 + (hash01(i + k * 11 + side * 5) - 0.5) * 0.06), [0, 1, 0]);
            }
          });
          // Roots and crystals hanging under the island.
          if (q % 11 === 5 && q > 2 && q < run.n - 2) {
            const name = (hangCount++ & 1) ? 'hanging_crystals' : 'hanging_roots';
            const fn = NK.art.props && NK.art.props[name];
            if (typeof fn === 'function') {
              try {
                const o = fn(U.rng((track.seed ^ Math.imul(hangCount, 7919)) >>> 0));
                const sd = (hangCount & 2) ? 1 : -1, off = sd * width[sd > 0 ? 1 : 0][i] * 0.42;
                const p = P(i, off, 0);
                o.position.set(p[0], nodes[i].y - TUCK - depth[i] * 0.7, p[2]);
                o.rotation.y = hash01(i) * TAU;
                hang.add(o);
              } catch (e) { warnOnce('hang', 'NK.world: ' + name + ' failed: ' + e.message); }
            }
          }
        }
        // End caps where the island stops (a jump gap or a bridge).
        if (q === 0 || q === run.n) {
          const ctr = P(i, 0, 0); ctr[1] = nodes[i].y - TUCK - depth[i] * 0.45;
          const F = ctx.Fv(i), dir = q === 0 ? -1 : 1, w = [F[0] * dir, 0, F[2] * dir];
          for (let k = 0; k < ring.length - 1; k++) B.triW(ctr, ring[k].w, ring[k + 1].w, shade(bandC[ring[k + 1].band], 0.9), w);
          B.triW(ctr, ring[ring.length - 1].w, ring[0].w, shade(gB, 0.85), w);
        }
        prev = { ring };
      }
    });
    [[B, 'islandRock'], [Gr, 'islandGrass']].forEach(([bb, name]) => {
      if (bb.empty) return;
      const geo = bb.geometry(); owned.geos.push(geo);
      const m = new THREE.Mesh(geo, NK.art.mat.lambertV()); m.name = name; root.add(m);
    });
    if (hang.children.length) { const merged = NK.art.mergeByMaterial(hang); merged.name = 'islandHang'; root.add(merged); }
    const b = SP.bounds(ctx.loop), reach = theme.fog.far + 220;
    return { groundAt, verts: 0, extent: { minX: b.minX - reach, maxX: b.maxX + reach, minZ: b.minZ - reach, maxZ: b.maxZ + reach } };
  }

  /** Sky bridges: a marble deck under the road and a gold-trimmed suspension arch hanging below. */
  function buildBridges(ctx) {
    const { N, nodes, seg } = ctx, on = ctx.onIsland, cut = ctx.pieces.cut, P = ctx.P;
    const isBridge = (i) => !on[i] && !cut[i];
    const B = new Builder(), marble = col(ctx.theme.wall.color), trim = col(ctx.theme.rail.a);
    let start = 0;
    while (start < N && isBridge(start)) start++;
    for (let q = 1; q <= N; q++) {
      const i0 = (start + q) % N;
      if (!isBridge(i0) || isBridge((i0 - 1 + N) % N)) continue;
      let n = 0; while (n < N && isBridge((i0 + n) % N)) n++;
      const sag = Math.min(14, 1.5 + n * seg * 0.1);
      for (let k = 0; k < n; k++) {
        const i = (i0 + k) % N, j = (i + 1) % N, u0 = k / n, u1 = (k + 1) / n;
        const HW = ROAD_HALF + 0.4;
        [-1, 1].forEach((sd) => {
          const out = [ctx.Rv(i)[0] * sd, 0, ctx.Rv(i)[2] * sd];
          B.quad(P(i, sd * HW, -0.02), P(i, sd * HW, -1.5), P(j, sd * HW, -0.02), P(j, sd * HW, -1.5), marble, out);
          B.quad(P(i, sd * HW, -1.3), P(i, sd * HW, -1.5), P(j, sd * HW, -1.3), P(j, sd * HW, -1.5), trim, out);
          // Hanging arch beam under each edge.
          const yA = -1.5 - sag * Math.sin(Math.PI * u0), yB = -1.5 - sag * Math.sin(Math.PI * u1), bx = sd * (ROAD_HALF - 1.2);
          B.quad(P(i, bx - 0.5, yA), P(i, bx + 0.5, yA), P(j, bx - 0.5, yB), P(j, bx + 0.5, yB), shade(marble, 0.8), [0, -1, 0]);
          B.quad(P(i, bx + sd * 0.5, yA + 0.9), P(i, bx + sd * 0.5, yA), P(j, bx + sd * 0.5, yB + 0.9), P(j, bx + sd * 0.5, yB), shade(marble, 0.9), out);
          B.quad(P(i, bx - sd * 0.5, yA + 0.9), P(i, bx - sd * 0.5, yA), P(j, bx - sd * 0.5, yB + 0.9), P(j, bx - sd * 0.5, yB), shade(marble, 0.85), [-out[0], 0, -out[2]]);
          if (k % 2 === 0 && k > 0) B.box(P(i, bx, (yA - 1.5) / 2), ctx.Rv(i), ctx.Fv(i), 0.18, Math.max(0.05, (-1.5 - yA) / 2), 0.18, trim);
        });
        B.quad(P(i, -HW, -1.5), P(i, HW, -1.5), P(j, -HW, -1.5), P(j, HW, -1.5), shade(marble, 0.7), [0, -1, 0]);
      }
    }
    if (B.empty) return;
    const geo = B.geometry(); ctx.owned.geos.push(geo);
    const m = new THREE.Mesh(geo, NK.art.mat.lambertV()); m.name = 'bridges'; ctx.root.add(m);
    void nodes;
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
