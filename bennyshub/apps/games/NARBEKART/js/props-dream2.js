/**
 * NARBE Racer — Dream Cup II scenery and hazards: Neon City and Clockwork Factory.
 *
 * Every prop and hazard the two themes list, registered exactly like the
 * other kits: NK.art.props[name](rng) and NK.art.hazard[name](rng), hazards
 * also as NK.art.hazard['kind:theme']. The street / gear-pit dressing and the
 * drive-through set pieces (holo_gate, neon_hoop, steam_gate, pipe_arch) are
 * props too, listed in DRESSING.
 *
 * How they are built (same rules as props-wonder.js):
 *   - Scenery is vertex-painted on the ONE shared flat Lambert material
 *     (NK.art.mat.lambertV) and welded to one mesh per material. Lit windows,
 *     neon tubes, lamps and molten metal use the ONE shared unlit vertex-colour
 *     material (NK.art.mat.basic + vertexColors), painted DEEP and saturated
 *     so nothing washes out to white. A scenery prop is one lambert mesh plus
 *     at most one glow mesh (plus a kept mover when it animates).
 *   - Hazards are cel-shaded (toonV) with a dark ink hull and sized to their
 *     collision boxes (DESIGN §9.4): a block fills one lane (2.8 × ≤2.5 × 2.6),
 *     a roller is a 2 m wheel / drum centred on its rolling axis (axle along
 *     Z), a geyser column is 1.6 m wide and 6 m tall when active, a puddle is
 *     3.6 × 6 m at y = 0.02. Faces look toward +Z, at the karts behind them.
 *   - Animation: root.userData.anim(t, dt) is ONE function of absolute time
 *     (props-gaps style). Rigid movers are welded child nodes flagged
 *     userData.keep; groups of separate movers (meshing gears, clock hands)
 *     are ONE kept mesh whose vertex groups each follow their own matrix. A
 *     copy that world.js freezes welds in the pose it was built in.
 *
 * Origins: on the ground (lowest point y = 0) facing -Z, except
 *   - the street dressing (traffic_car, bus_city, street_light_low,
 *     crosswalk): origin on the street floor, the crossing a decal at y 0.02;
 *   - gear_giant: origin at the gear's CENTRE (it spins about X, half sunk);
 *   - molten_pour: origin at the molten surface, its pillars sunk below it;
 *   - catwalk_broken: origin at the rim edge, the walkway jutting out to -Z;
 *   - the road-straddling set pieces: origin on the road's centre line on the
 *     ground, span along X, and NOTHING where |x| < 12.5 and 0 < y < 12 (a
 *     final pass guarantees the karts' opening vertex by vertex).
 */
NK.propsDream2 = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;

  /* ── Catalogue (the contract with themes.js and world.js) ─────────────── */
  const THEMES = {
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
  /** Street / gear-pit dressing and drive-through set pieces: props, but not in a theme list. */
  const DRESSING = ['traffic_car', 'bus_city', 'street_light_low', 'crosswalk', 'holo_gate', 'neon_hoop',
    'gear_giant', 'molten_pour', 'catwalk_broken', 'steam_gate', 'pipe_arch'];

  /* ── Colour ──────────────────────────────────────────────────────────── */
  const _col = new THREE.Color();
  const _col2 = new THREE.Color();
  const _hsl = { h: 0, s: 0, l: 0 };

  /** A sibling of `hex`: lightness nudged by up to ±dl, hue by a hair. */
  function tone(hex, rng, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    const h = _hsl.h + rng.range(-0.01, 0.01);
    _col.setHSL(h - Math.floor(h), _hsl.s, U.clamp(_hsl.l + rng.range(-dl, dl), 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function pick(list, rng, dl) { return tone(rng.pick(list), rng, dl === undefined ? 0.03 : dl); }
  function shade(hex, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    _col.setHSL(_hsl.h, _hsl.s, U.clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function mixHex(a, b, t) { return _col.setHex(a).lerp(_col2.setHex(b), U.clamp(t, 0, 1)).getHex(); }
  /** The entries of `list`, shuffled by rng. */
  function shuffled(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /**
   * Bake a colour per TRIANGLE (the crisp low-poly facet look). `col` is a hex
   * or a function of the face centroid (cx, cy, cz, faceIndex) → hex. o.jit
   * jiggles each face's lightness; o.grad lightens toward the top of
   * [o.y0, o.y1] (default: the part's own height).
   */
  function paintFaces(geo, col, rng, o) {
    o = o || {};
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const P = g.attributes.position, n = P.count;
    const jit = o.jit || 0, grad = o.grad || 0;
    let y0 = o.y0, y1 = o.y1;
    if (grad && (y0 === undefined || y1 === undefined)) {
      g.computeBoundingBox();
      if (y0 === undefined) y0 = g.boundingBox.min.y;
      if (y1 === undefined) y1 = g.boundingBox.max.y;
    }
    const spanY = grad ? ((y1 - y0) || 1) : 1;
    const fixed = typeof col === 'number';
    if (fixed) _col.setHex(col);
    const out = new Float32Array(n * 3);
    for (let t = 0; t + 2 < n; t += 3) {
      const cy = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3;
      if (!fixed) {
        const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3;
        const cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3;
        _col.setHex(col(cx, cy, cz, t / 3));
      }
      let d = jit ? (rng.next() * 2 - 1) * jit : 0;
      if (grad) d += grad * (U.clamp((cy - y0) / spanY, 0, 1) - 0.5);
      const f = d ? Math.pow(Math.max(0.1, 1 + d), 2.2) : 1;
      for (let k = 0; k < 9; k += 3) {
        out[t * 3 + k] = _col.r * f;
        out[t * 3 + k + 1] = _col.g * f;
        out[t * 3 + k + 2] = _col.b * f;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
    return g;
  }

  /* ── Geometry helpers ─────────────────────────────────────────────────── */
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();

  /** Bake scale (o.s) → rotation (o.r, Euler order o.order) → position (o.p). */
  function place(geo, o) {
    if (!o || (o.s === undefined && !o.r && !o.p)) return geo;
    const s = o.s === undefined ? 1 : o.s;
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _e.set(o.r ? o.r[0] : 0, o.r ? o.r[1] : 0, o.r ? o.r[2] : 0, o.order || 'XYZ');
    _q.setFromEuler(_e);
    _p.set(o.p ? o.p[0] : 0, o.p ? o.p[1] : 0, o.p ? o.p[2] : 0);
    geo.applyMatrix4(_m4.compose(_p, _q, _s));
    return geo;
  }
  /** Point a geometry built along +Y (centred) from a to b. */
  function span(geo, a, b) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  /** A round rod from a to b (radius r0 at a, r1 at b); `open` drops the end caps. */
  const rod = (a, b, r0, r1, seg, open) =>
    span(new THREE.CylinderGeometry(r1, r0, Math.max(1e-3, dist(a, b)), seg || 5, 1, !!open), a, b);
  /** A square bar from a to b. */
  const bar = (a, b, w, d) => span(new THREE.BoxGeometry(w, Math.max(1e-3, dist(a, b)), d === undefined ? w : d), a, b);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d === undefined ? 1 : d);

  /** Pseudo-random -1..1 from a position, so vertices duplicated along seams agree. */
  function hash3(x, y, z, seed) {
    const h = Math.sin(Math.round(x * 997) * 0.1373 + Math.round(y * 997) * 0.2711 +
                       Math.round(z * 997) * 0.1619 + seed * 7.31) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  }

  /** Push vertices in or out from the geometry's origin by up to ±amt of their distance. */
  function lump(geo, amt, seed) {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const k = 1 + amt * hash3(x, y, z, seed);
      P.setXYZ(i, x * k, y * k, z * k);
    }
    P.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /** A rounded box ("squircle" sphere): p < 1 squares it off, 1 is a sphere. */
  function roundBox(w, h, d, p, ws, hs) {
    const g = new THREE.SphereGeometry(1, ws || 12, hs || 9);
    const P = g.attributes.position;
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), p);
    for (let i = 0; i < P.count; i++) P.setXYZ(i, f(P.getX(i)) * w / 2, f(P.getY(i)) * h / 2, f(P.getZ(i)) * d / 2);
    g.computeVertexNormals();
    return g;
  }

  /** A flat disc in the XZ plane facing +Y, in rings so it can be painted by radius. */
  function disc(radii, segs, shape) {
    const pos = [0, 0, 0];
    for (let j = 0; j < radii.length; j++) {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TAU, r = radii[j] * (shape ? shape(a) : 1);
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    const idx = [];
    for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
    for (let j = 1; j < radii.length; j++) {
      const a0 = 1 + (j - 1) * segs, b0 = 1 + j * segs;
      for (let i = 0; i < segs; i++) {
        const i1 = (i + 1) % segs;
        idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nor = new Float32Array(pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  function blobShape(rng, amt) {
    const p1 = rng.range(0, TAU), p2 = rng.range(0, TAU), p3 = rng.range(0, TAU);
    return (a) => 1 + amt * (0.55 * Math.sin(2 * a + p1) + 0.3 * Math.sin(3 * a + p2) + 0.15 * Math.sin(5 * a + p3));
  }

  /** A tube along a list of points (CatmullRom). */
  function tubeGeo(points, radius, segs, radial, closed) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!closed);
    return new THREE.TubeGeometry(curve, segs || 24, radius, radial || 5, !!closed);
  }

  /** An arc of a ring in the XY plane, centred on the bottom (smile) or top (happy eye). */
  function arcGeo(R, tube, arc, top) {
    const g = new THREE.TorusGeometry(R, tube, 5, 12, arc);
    g.rotateZ((top ? HALF_PI : -HALF_PI) - arc / 2);
    return g;
  }

  /** An n-pointed star outline in the XY plane. */
  function starShape(R, r, n) {
    const s = new THREE.Shape();
    n = n || 5;
    for (let i = 0; i < 2 * n; i++) {
      const a = HALF_PI + i * Math.PI / n, rr = i % 2 ? r : R;
      if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    return s;
  }
  /** A heart outline (about 1 × 0.95 at size 1) centred on the origin in the XY plane. */
  function heartShape(sz) {
    const s = sz || 1, h = new THREE.Shape();
    h.moveTo(0, -0.45 * s);
    h.bezierCurveTo(-0.15 * s, -0.3 * s, -0.5 * s, -0.06 * s, -0.5 * s, 0.17 * s);
    h.bezierCurveTo(-0.5 * s, 0.42 * s, -0.18 * s, 0.52 * s, 0, 0.27 * s);
    h.bezierCurveTo(0.18 * s, 0.52 * s, 0.5 * s, 0.42 * s, 0.5 * s, 0.17 * s);
    h.bezierCurveTo(0.5 * s, -0.06 * s, 0.15 * s, -0.3 * s, 0, -0.45 * s);
    return h;
  }
  /** A shape from a list of [x, y] points. */
  function polyShape(pts) {
    const s = new THREE.Shape();
    pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
    s.closePath();
    return s;
  }
  /** A flat solid from a shape, `depth` thick, front face at z = +depth/2. */
  function slab(shape, depth, curveSegs) {
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: curveSegs || 4 }).translate(0, 0, -depth / 2);
  }

  /** A basis for a face: outward normal n, up u, centred at p (local +Z → n, +Y → up). */
  const _fr = new THREE.Vector3(), _fu = new THREE.Vector3(), _fn = new THREE.Vector3();
  function faceM(n, up, p) {
    _fn.set(n[0], n[1], n[2]).normalize();
    _fu.set(up[0], up[1], up[2]).normalize();
    _fr.crossVectors(_fu, _fn).normalize();
    return new THREE.Matrix4().makeBasis(_fr, _fu, _fn).setPosition(p[0], p[1], p[2]);
  }

  /**
   * A cols × rows grid of panes (windows) in the XY plane facing +Z, W × H
   * overall and centred on the origin, gx / gy metres of wall between panes.
   * fn(i, j) → hex paints a pane, or null leaves that one out. Pre-painted.
   */
  function paneGrid(W, H, cols, rows, gx, gy, fn) {
    const pos = [], col = [];
    const cw = W / cols, ch = H / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const hex = fn(i, j);
        if (hex === null || hex === undefined) continue;
        const x0 = -W / 2 + i * cw + gx / 2, x1 = x0 + cw - gx, y0 = -H / 2 + j * ch + gy / 2, y1 = y0 + ch - gy;
        pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
        _col.setHex(hex);
        for (let k = 0; k < 6; k++) col.push(_col.r, _col.g, _col.b);
      }
    }
    if (!pos.length) { pos.push(0, 0, 0, 0.01, 0, 0, 0, 0.01, 0); col.push(0, 0, 0, 0, 0, 0, 0, 0, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * A gear outline in the XY plane: `teeth` flat-topped teeth from the root
   * circle (r1 - o.tooth) out to r1, with a round hub hole (o.hub) and o.win
   * spoke windows between o.wIn and o.wOut. ExtrudeGeometry-ready.
   */
  function gearShape(r1, teeth, o) {
    o = o || {};
    const r0 = r1 - (o.tooth || r1 * 0.13), s = new THREE.Shape(), da = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * da;
      const pts = [[r0, a], [r1, a + da * 0.14], [r1, a + da * 0.42], [r0, a + da * 0.56]];
      pts.forEach(([rr, aa], j) => {
        const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr;
        if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
      });
    }
    s.closePath();
    const ring = (rad, n, a0) => {
      const h = new THREE.Path();
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * TAU;
        if (i) h.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else h.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      h.closePath();
      return h;
    };
    if (o.hub) s.holes.push(ring(o.hub, o.hubSegs || 10, 0));
    if (o.win) {
      const wi = o.wIn || r0 * 0.38, wo = o.wOut || r0 * 0.78, gap = o.spoke || 0.32;
      for (let w = 0; w < o.win; w++) {
        const a0 = (w + gap / 2) / o.win * TAU, a1 = (w + 1 - gap / 2) / o.win * TAU, h = new THREE.Path();
        const n = 4;
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const f = i ? 'lineTo' : 'moveTo'; h[f](Math.cos(a) * wo, Math.sin(a) * wo); }
        for (let i = n - 1; i >= 1; i--) { const a = a0 + (a1 - a0) * i / n; h.lineTo(Math.cos(a) * wi, Math.sin(a) * wi); }
        h.closePath();
        s.holes.push(h);
      }
    }
    return s;
  }
  /** A gear plate `depth` thick (along Z, centred), from gearShape. */
  function gearGeo(r1, teeth, depth, o) {
    return new THREE.ExtrudeGeometry(gearShape(r1, teeth, o), { depth, bevelEnabled: false, curveSegments: 2 }).translate(0, 0, -depth / 2);
  }

  /**
   * The centre line of a road arch: feet at (±hw, 0), straight legs up to y0,
   * then a squircle crown (exponent n: 2 = ellipse, higher = squarer) that
   * peaks at y0 + rise. Points run from the left foot to the right foot.
   */
  function archPath(hw, y0, rise, n, steps) {
    const pts = [[-hw, 0, 0], [-hw, y0 * 0.5, 0]];
    for (let i = 0; i <= steps; i++) {
      const th = Math.PI * (1 - i / steps), c = Math.cos(th), s = Math.sin(th);
      pts.push([hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y0 + rise * Math.pow(Math.abs(s), 2 / n), 0]);
    }
    pts.push([hw, y0 * 0.5, 0], [hw, 0, 0]);
    return pts;
  }

  /* ── Shared materials ─────────────────────────────────────────────────── */
  /** Unlit vertex colour: windows, neon, lamps, molten metal (paint DEEP colours). */
  const GLOW = () => A.mat.basic(0xffffff, { vertexColors: true });

  /* ── Kit: one prop under construction ────────────────────────────────── */
  function Kit(rng, toon) {
    this.rng = rng;
    this.mat = toon ? A.mat.toonV() : A.mat.lambertV();
    this.root = new THREE.Group();
  }
  /**
   * @param geo     a fresh geometry (consumed)
   * @param col     hex, face-colour function, or null when already painted
   * @param o       { s, r, p, order, m, jit, grad, y0, y1, noInk, mat }
   * @param parent  a node to hang the part on (default: the root)
   */
  Kit.prototype.add = function (geo, col, o, parent) {
    o = o || {};
    place(geo, o);
    if (o.m) geo.applyMatrix4(o.m);
    const g = col === null ? geo : paintFaces(geo, col, this.rng, o);
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Mesh(g, o.mat || this.mat);
    if (o.noInk) m.userData.noOutline = true;
    (parent || this.root).add(m);
    return m;
  };
  /** A glowing part (unlit, deep colour, never inked). */
  Kit.prototype.glow = function (geo, col, o, parent) {
    return this.add(geo, col, Object.assign({ mat: GLOW(), noInk: true }, o || {}), parent);
  };

  /** Welded ink shells keep their outline flag, so tools can tell hull from body. */
  function flagInk(out) {
    out.traverse((m) => { if (m.isMesh && m.material && m.material.side === THREE.BackSide) m.userData.outline = true; });
    return out;
  }
  /** Weld a moving part to one mesh per material and flag it to survive later welds. */
  function keep(node) {
    const out = flagInk(A.mergeByMaterial(node));
    out.userData.keep = true;
    return out;
  }
  /** Ink shell from a simple closed hull that is never drawn itself. */
  function inkHull(geo, parent, thickness) {
    const tmp = new THREE.Mesh(geo, A.mat.lambertV());
    const shell = A.outline(tmp, thickness);
    tmp.remove(shell);
    geo.dispose();
    parent.add(shell);
    return shell;
  }

  const _box = new THREE.Box3();
  const _bb = new THREE.Box3();
  /** Bounds of the drawn geometry — ink shells and shadows excluded. */
  function bounds(root) {
    root.updateMatrixWorld(true);
    _box.makeEmpty();
    root.traverse((o) => {
      if (!o.isMesh || o.userData.outline || o.userData.shadow) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      _box.union(_bb);
    });
    return _box;
  }
  function shiftY(kit, dy) {
    if (Math.abs(dy) > 1e-5) kit.root.children.forEach((c) => { c.position.y += dy; });
  }
  /** Sit the prop on its ground line (lowest point at `ground`) and weld it. */
  function finish(kit, ground) {
    shiftY(kit, (ground || 0) - bounds(kit.root).min.y);
    return flagInk(A.mergeByMaterial(kit.root));
  }
  /** Keep the built origin (pit dressing, crossing decal, arches). */
  function finishAt(kit) { return flagInk(A.mergeByMaterial(kit.root)); }

  /* ── Animation: root.userData.anim(t, dt) is one function ─────────────── */
  function onAnim(k, fn) {
    const ud = k.root.userData;
    if (!ud.anim) {
      const fns = [];
      ud.anim = function (t, dt) { for (let i = 0; i < fns.length; i++) fns[i](t || 0, dt || 0); };
      Object.defineProperty(ud.anim, 'fns', { value: fns });
    }
    ud.anim.fns.push(fn);
  }
  // Rest values are read on the first call, after every weld has settled.
  function sway(k, node, axis, speed, amp, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.rotation[axis]; node.rotation[axis] = rest + amp * Math.sin(speed * t + (phase || 0)); });
  }
  function spin(k, node, axis, speed, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.rotation[axis]; node.rotation[axis] = rest + speed * t + (phase || 0); });
  }

  /** Gather painted meshes from nodes into flat arrays with a group id per vertex. */
  function gather(nodes) {
    let n = 0;
    const list = [];
    nodes.forEach((node, g) => node.children.forEach((m) => {
      if (!m.isMesh) return;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      list.push([geo, g]);
      n += geo.attributes.position.count;
    }));
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), gid = new Uint16Array(n);
    let o = 0;
    list.forEach(([geo, g]) => {
      const P = geo.attributes.position, C = geo.attributes.color;
      pos.set(P.array, o * 3);
      if (C) col.set(C.array, o * 3); else col.fill(1, o * 3, (o + P.count) * 3);
      gid.fill(g, o, o + P.count);
      o += P.count;
      geo.dispose();
    });
    return { n, pos, col, gid };
  }
  /**
   * A rig: every node in `nodes` (a Group of parts built in prop space)
   * becomes one vertex group of a single kept mesh. fn(g, t, M) sets the
   * Matrix4 M (identity on entry) that moves group g at time t.
   */
  function rig(k, nodes, mat, fn, margin) {
    const d = gather(nodes), base = d.pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.keep = true;
    k.root.add(mesh);
    const M = new THREE.Matrix4(), mats = nodes.map(() => new Float32Array(16)), pos = d.pos;
    function apply(t) {
      for (let g = 0; g < nodes.length; g++) { M.identity(); fn(g, t, M); mats[g].set(M.elements); }
      for (let i = 0; i < d.n; i++) {
        const e = mats[d.gid[i]], x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        pos[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      geo.attributes.position.needsUpdate = true;
    }
    apply(0);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += margin || 1;
    onAnim(k, (t) => apply(t));
    return mesh;
  }
  /** M ← M · (rotate by `angle` about the axis (ax, ay, az) through point p). */
  const _rv = new THREE.Vector3(), _rm = new THREE.Matrix4();
  function aboutAxis(M, p, ax, ay, az, angle) {
    M.multiply(_rm.makeTranslation(p[0], p[1], p[2]));
    M.multiply(_rm.makeRotationAxis(_rv.set(ax, ay, az).normalize(), angle));
    M.multiply(_rm.makeTranslation(-p[0], -p[1], -p[2]));
    return M;
  }

  /** A soft contact shadow under a hazard (flagged keep: never welded into it). */
  function shadow(root, w, d) {
    const s = A.blobShadow(1);
    s.scale.set(w, d, 1);
    s.userData.shadow = true;
    s.userData.keep = true;
    root.add(s);
    return s;
  }

  /* ── Registration ─────────────────────────────────────────────────────── */
  function prop(name, build) {
    A.props[name] = function (rng) {
      const obj = build(rng || U.rng(U.hash(name)));
      obj.name = name;
      return obj;
    };
  }
  /**
   * Hazards also carry userData.kind and, when they move on their own,
   * userData.idle(t, dt). Rollers carry rollRadius and rollNode (the child to
   * spin about its local Z as the hazard slides along X) and are built with
   * their bounds centred on that axis and no ground shadow.
   */
  function hazard(name, kind, themeId, build) {
    const fn = function (rng) {
      const obj = build(rng || U.rng(U.hash(name)));
      obj.name = name;
      obj.userData.kind = kind;
      const an = obj.userData.anim;
      if (typeof an === 'function' && !obj.userData.idle) obj.userData.idle = an;
      return obj;
    };
    A.hazard[name] = fn;
    A.hazard[kind + ':' + themeId] = fn;
  }
  /** Scale a hazard's baked geometry to exact collision dims, ink it and weld it. */
  function sizeHazard(k, dims) {
    const b = bounds(k.root), size = new THREE.Vector3(), c = new THREE.Vector3();
    b.getSize(size); b.getCenter(c);
    const sx = dims[0] / size.x, sy = dims[1] / size.y, sz = dims[2] / size.z;
    k.root.traverse((m) => {
      if (m.isMesh) m.geometry.translate(-c.x, -b.min.y, -c.z).scale(sx, sy, sz);
    });
    A.ink(k.root, 0.055);
    return finish(k);
  }
  /**
   * Centre a roller's baked parts on its rolling axis (Z) and size it to 2R
   * across, so spinning about the bounds centre (world.js) or rollNode never
   * wobbles.
   */
  function centreRoller(node, R) {
    const b = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3();
    node.children.forEach((m) => {
      if (!m.isMesh || m.userData.outline) return;
      m.geometry.computeBoundingBox();
      b.union(m.geometry.boundingBox);
    });
    b.getCenter(c); b.getSize(size);
    const s = 2 * R / Math.max(size.x, size.y);
    node.children.forEach((m) => { if (m.isMesh) m.geometry.translate(-c.x, -c.y, -c.z).scale(s, s, s); });
  }
  /** Finish a roller: centre it, ink it, key it as the rolling node. */
  function finishRoller(k, node, R, inkT) {
    centreRoller(node, R);
    A.ink(node, inkT || 0.05);
    const roll = keep(node);
    roll.name = 'roll';
    roll.position.set(0, R, 0);
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  }
  /**
   * Geyser rig: an inked base and a separate column node that rises from
   * y = 0. setState follows props-moonlight's geyser(): hidden when idle, a
   * steady low stub while warning, full height (with a gentle surge) while
   * active — never a flashing effect.
   */
  function geyserRig(base, column) {
    column.userData.keep = true;
    base.add(column);
    column.visible = false;
    base.userData.setState = function (active, warn, u) {
      column.visible = !!(active || warn);
      column.scale.set(1, active ? 0.93 + 0.07 * Math.sin((u || 0) * TAU * 3) : 0.08, 1);
    };
    return base;
  }
  /**
   * Puddle builder: a lane-wide blob at y = 0.02, centred and sized to
   * exactly 2·halfW × 2·halfL, whose outermost ring is painted dark (its ink
   * line — a flat decal cannot carry a hull).
   */
  function puddleBase(k, radii, fill, rim, halfW, halfL) {
    const shape = blobShape(k.rng, 0.05);
    const g = paintFaces(disc(radii, 36, shape), (cx, cy, cz) => {
      const rho = Math.hypot(cx, cz) / shape(Math.atan2(cz, cx));
      return rho > 0.955 ? rim : fill(rho, cx, cz);
    }, k.rng, { jit: 0.025 });
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
    g.scale(2 / (bb.max.x - bb.min.x), 1, 2 / (bb.max.z - bb.min.z));
    k.add(g, null, { s: [halfW, 1, halfL], p: [0, 0.02, 0], noInk: true });
    return shape;
  }

  /* ── Arch openings ───────────────────────────────────────────────────── */
  const GATE_HALF = 12.5, GATE_TOP = 12;
  /**
   * Push any vertex that strays into the drive-through box (|x| < 12.5 + m,
   * 0.02 < y < 12 + m) back out through the nearest wall: a last guarantee on
   * top of arches already designed with clearance.
   */
  function clearOpening(root, m) {
    const hx = GATE_HALF + m, hy = GATE_TOP + m;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const P = o.geometry.attributes.position, e = o.matrixWorld.elements;
      let moved = false;
      for (let i = 0; i < P.count; i++) {
        // Arch parts are welded in root space (identity matrices); offsets are honoured.
        const x = P.getX(i) + e[12], y = P.getY(i) + e[13];
        if (Math.abs(x) >= hx || y >= hy || y <= 0.02) continue;
        if (hx - Math.abs(x) < hy - y) P.setX(i, Math.sign(x || 1) * hx - e[12]);
        else P.setY(i, hy - e[13]);
        moved = true;
      }
      if (moved) { P.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); }
    });
  }

  /* ── Small shared pieces ──────────────────────────────────────────────── */
  const INK = 0x1f1b2e;
  const WHITE = 0xffffff;

  /** A lumpy leaf/rock ball, flattened by `sq`, lighter on top. */
  function lobe(k, x, y, z, R, col, sq, parent) {
    const g = lump(ico(1, 1), 0.12, k.rng.next() * 99);
    return k.add(g, col, { s: [R, R * (sq || 0.7), R], p: [x, y, z], jit: 0.07, grad: 0.45 }, parent);
  }
  /** A soft round puff (steam, smoke): pale on top, a tint underneath. */
  function puff(k, x, y, z, R, sq, cols, segs, parent, mat) {
    const base = y - R * (sq || 1) * 0.15;
    return k.add(new THREE.SphereGeometry(1, segs || 10, segs ? Math.max(5, segs - 4) : 6), (cx, cy) => (cy < base ? cols[1] : cols[0]),
      { s: [R, R * (sq || 1), R], p: [x, y, z], jit: 0.02, grad: 0.12, mat }, parent);
  }
  /** A neon tube along points: straight glass rods with round joints. */
  function neonLine(k, pts, r, col, closed, parent) {
    const n = pts.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) k.glow(rod(pts[i], pts[(i + 1) % n], r, r, 6, true), col, {}, parent);
    for (let i = 0; i < n; i++) k.glow(ico(r * 1.02, 0), col, { p: pts[i] }, parent);
  }
  /** A glowing frame of four bars round a w × d rectangle at height y. */
  function rimGlow(k, x, z, w, d, y, t, col) {
    [-1, 1].forEach((s) => {
      k.glow(new THREE.BoxGeometry(w + t, t, t), col, { p: [x, y, z + s * d / 2] });
      k.glow(new THREE.BoxGeometry(t, t, d - t), col, { p: [x + s * w / 2, y, z] });
    });
  }
  /** Shape outline points (a closed list of [x, y, z]) placed at depth z. */
  function outlinePts(shape, z, div, sc) {
    const s = sc || 1;
    const pts = shape.getPoints(div || 4);
    if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
    return pts.map((p) => [p.x * s, p.y * s, z]);
  }

  /* ════════════════════════════════════════════════════════════════════════
   * NEON CITY — a friendly city at night: deep navy and purple buildings,
   * glowing pink, cyan, violet and amber
   * ════════════════════════════════════════════════════════════════════════ */
  const NAVY = [0x2c2a58, 0x35306a, 0x2a3566, 0x3d2f68, 0x302c5c];
  const PINK = 0xff2fa6, CYAN = 0x18c8f2, VIOLET = 0x9a40ff, AMBER = 0xffa526, LIME = 0x5ee83a;
  const NEONS = [PINK, CYAN, VIOLET, AMBER];
  const WIN_WARM = [0xffbf45, 0xffad30, 0xffcf5e];
  const WIN_COOL = [0x45c8f5, 0x6ad4ff];
  const WIN_DARK = 0x191b38;
  const METAL = 0x3d3a5c;

  /** A window palette for one building: mostly `main`, a few accents, some dark panes. */
  function windowMood(r, litP) {
    const warm = r.chance(0.6);
    const main = warm ? r.pick(WIN_WARM) : r.pick(WIN_COOL);
    const acc = warm ? r.pick([0x45c8f5, 0xff5cc0]) : r.pick([0xffbf45, 0xff5cc0]);
    return () => { const u = r.next(); return u < litP * 0.84 ? main : u < litP ? acc : WIN_DARK; };
  }
  /**
   * Window panes on the walls of a w × d box spanning y0..y0+h (centre x, z):
   * o = { floor, col, gx, gy, vm, hm, fn(side, i, j), sides: [0 front, 1 +X, 2 back, 3 -X] }.
   */
  function boxWindows(k, x, z, w, d, y0, h, o) {
    const rows = Math.max(1, Math.round((h - 2 * (o.vm === undefined ? 0.3 : o.vm)) / o.floor)), hh = rows * o.floor;
    [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]].forEach((n, si) => {
      if (o.sides && o.sides.indexOf(si) < 0) return;
      const sp = n[2] ? w : d, half = n[2] ? d / 2 : w / 2;
      const cols = Math.max(1, Math.round((sp - 2 * (o.hm === undefined ? 0.6 : o.hm)) / o.col));
      const g = paneGrid(cols * o.col, hh, cols, rows, o.gx, o.gy, (i, j) => o.fn(si, i, j));
      k.glow(g, null, { m: faceM(n, [0, 1, 0], [x + n[0] * (half + 0.05), y0 + h / 2, z + n[2] * (half + 0.05)]) });
    });
  }

  /* ── Neon near ──────────────────────────────────────────────────────── */

  /** A swan-neck street lamp with a glowing ring head and neon bands on the post (~6 m). */
  prop('neon_lamp', (r) => {
    const k = new Kit(r), H = r.range(5.7, 6.2), post = pick([0x3b3658, 0x2f3a5c, 0x45345e], r, 0.02);
    const cols = shuffled(NEONS, r), neon = cols[0], neon2 = cols[1];
    k.add(new THREE.CylinderGeometry(0.3, 0.38, 0.45, 8), shade(post, -0.04), { p: [0, 0.225, 0], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(0.2, 0.26, 0.14, 8), shade(post, 0.08), { p: [0, 0.52, 0] });
    k.add(new THREE.CylinderGeometry(0.085, 0.12, H - 1.0, 7), post, { p: [0, 0.5 + (H - 1.0) / 2, 0], grad: 0.25 });
    k.glow(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8, 1, true), neon, { p: [0, 1.75, 0] });
    k.glow(new THREE.TorusGeometry(0.14, 0.04, 4, 10), neon2, { r: [HALF_PI, 0, 0], p: [0, 2.12, 0] });
    k.glow(new THREE.TorusGeometry(0.14, 0.04, 4, 10), neon2, { r: [HALF_PI, 0, 0], p: [0, 1.38, 0] });
    // The swan neck reaches out over the pavement to a dome head.
    const neck = [[0, H - 1.2, 0], [0, H - 0.4, -0.1], [0, H - 0.08, -0.6], [0, H - 0.16, -1.15], [0, H - 0.45, -1.45]];
    k.add(tubeGeo(neck, 0.075, 14, 6), post);
    const hy = H - 0.55, hz = -1.55;
    k.add(new THREE.SphereGeometry(0.52, 12, 5, 0, TAU, 0, HALF_PI), shade(post, 0.1), { s: [1, 0.6, 1], p: [0, hy, hz], grad: 0.2 });
    k.glow(new THREE.TorusGeometry(0.5, 0.07, 5, 18), neon, { r: [HALF_PI, 0, 0], p: [0, hy - 0.01, hz] });
    k.glow(new THREE.CircleGeometry(0.46, 16), 0xffd979, { r: [HALF_PI, 0, 0], p: [0, hy - 0.02, hz] });
    k.glow(ico(0.13, 1), neon2, { p: [0, hy + 0.36, hz] });
    return finish(k);
  });

  /** A round street tree in a square planter wrapped in neon, fairy lights in its crown (~5 m). */
  prop('planter_tree', (r) => {
    const k = new Kit(r), conc = pick([0x6a6390, 0x5d6488, 0x726a96], r, 0.03), neon = r.pick([CYAN, PINK, VIOLET]);
    const W = r.range(1.7, 1.9), Hp = 0.8;
    k.add(new THREE.BoxGeometry(W, Hp, W), conc, { p: [0, Hp / 2, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(W + 0.14, 0.14, W + 0.14), shade(conc, 0.1), { p: [0, Hp + 0.02, 0] });
    k.add(new THREE.BoxGeometry(W - 0.1, 0.06, W - 0.1), 0x3a2a24, { p: [0, Hp + 0.07, 0] });
    for (let i = 0; i < 4; i++) {
      const a = i * HALF_PI;
      k.glow(new THREE.PlaneGeometry(W - 0.24, 0.09), neon, { r: [0, a, 0], p: [Math.sin(a) * (W / 2 + 0.012), Hp - 0.2, Math.cos(a) * (W / 2 + 0.012)] });
    }
    const Ht = r.range(1.9, 2.2), lean = r.range(-0.05, 0.05);
    k.add(rod([0, Hp, 0], [lean, Hp + Ht + 0.6, 0], 0.16, 0.1, 6), 0x6b4a3a, { jit: 0.04 });
    const leaf = [0x2f9a72, 0x38a87c, 0x2a8a68, 0x46b48a], cy = Hp + Ht + 1.0;
    const lobes = [[0, cy, 0, 1.25], [0.78, cy - 0.3, 0.2, 0.85], [-0.72, cy - 0.25, -0.15, 0.9], [0.1, cy + 0.78, -0.1, 0.85], [-0.2, cy - 0.2, 0.78, 0.8], [0.25, cy - 0.15, -0.8, 0.78]];
    lobes.forEach(([x, y, z, R]) => lobe(k, x + lean, y, z, R, pick(leaf, r, 0.03), 0.85));
    // Fairy lights strung round the crown.
    const fl = [AMBER, PINK, CYAN, 0xffe45c];
    for (let i = 0; i < 18; i++) {
      const t = i / 17, a = t * TAU * 2.2 + r.range(-0.1, 0.1), y = cy - 0.75 + t * 1.6, rr = 1.55 - Math.abs(t - 0.45) * 0.9;
      k.glow(ico(0.1, 0), fl[i % 4], { p: [lean + Math.cos(a) * rr, y, Math.sin(a) * rr] });
    }
    return finish(k);
  });

  /** A bright red fire hydrant with a yellow bonnet (~1 m). */
  prop('hydrant', (r) => {
    const k = new Kit(r), red = pick([0xe8333a, 0xe23048], r, 0.02), cap = 0xffc81f;
    k.add(new THREE.CylinderGeometry(0.3, 0.33, 0.08, 10), shade(red, -0.12), { p: [0, 0.04, 0] });
    k.add(new THREE.CylinderGeometry(0.2, 0.23, 0.62, 10), red, { p: [0, 0.39, 0], grad: 0.18 });
    k.add(new THREE.CylinderGeometry(0.206, 0.206, 0.07, 10, 1, true), 0xf4f0ff, { p: [0, 0.6, 0] });
    k.add(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 10), cap, { p: [0, 0.72, 0] });
    k.add(new THREE.SphereGeometry(0.23, 10, 4, 0, TAU, 0, HALF_PI), cap, { p: [0, 0.75, 0], grad: 0.2 });
    k.add(new THREE.CylinderGeometry(0.06, 0.075, 0.12, 5), cap, { p: [0, 1.0, 0] });
    [-1, 1].forEach((s) => {
      k.add(new THREE.CylinderGeometry(0.08, 0.09, 0.2, 8), red, { r: [0, 0, HALF_PI], p: [s * 0.27, 0.45, 0] });
      k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), cap, { r: [0, 0, HALF_PI], p: [s * 0.38, 0.45, 0] });
    });
    k.add(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 8), red, { r: [HALF_PI, 0, 0], p: [0, 0.42, -0.26] });
    k.add(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 8), cap, { r: [HALF_PI, 0, 0], p: [0, 0.42, -0.36] });
    return finish(k);
  });

  /** A sign board on legs with a big glowing neon star, heart or arrow (~4 m; faces the road). */
  prop('neon_sign', (r) => {
    const k = new Kit(r), frame = pick([0x2a2748, 0x31284f, 0x262c4e], r, 0.02);
    const kind = r.pick(['star', 'heart', 'arrow']), cols = shuffled(NEONS, r), main = cols[0], edge = cols[1];
    const W = 2.7, H = 2.3, y0 = 1.5, cy = y0 + H / 2, fz = -0.08;
    [-1, 1].forEach((s) => {
      k.add(new THREE.CylinderGeometry(0.07, 0.085, y0 + H - 0.2, 6), METAL, { p: [s * 0.95, (y0 + H - 0.2) / 2, 0.1] });
      k.add(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 8), shade(METAL, -0.05), { p: [s * 0.95, 0.07, 0.1] });
    });
    k.add(new THREE.BoxGeometry(W, H, 0.14), frame, { p: [0, cy, 0], jit: 0.02 });
    // Neon border.
    const bw = W / 2 - 0.1, bh = H / 2 - 0.1;
    neonLine(k, [[-bw, cy - bh, fz], [bw, cy - bh, fz], [bw, cy + bh, fz], [-bw, cy + bh, fz]], 0.04, edge, true);
    let shape, div = 2;
    if (kind === 'star') shape = starShape(0.95, 0.42, 5);
    else if (kind === 'heart') { shape = heartShape(1.85); div = 5; }
    else shape = polyShape([[-0.95, -0.22], [0.15, -0.22], [0.15, -0.6], [0.95, 0], [0.15, 0.6], [0.15, 0.22], [-0.95, 0.22]]);
    // A deep tinted fill behind a bright tube outline.
    const fill = slab(shape, 0.04, 6).rotateY(Math.PI);
    k.glow(fill, mixHex(main, frame, 0.5), { p: [0, cy, fz - 0.01] });
    neonLine(k, outlinePts(shape, 0, div).map((p) => [-p[0], p[1] + cy, fz - 0.06]), 0.055, main, true);
    // Two little sparkles in the corners.
    [[-1, 1], [1, -1]].forEach(([sx, sy]) => k.glow(slab(starShape(0.18, 0.05, 4), 0.03), 0xffe45c, { p: [sx * (bw - 0.25), cy + sy * (bh - 0.25), fz] }));
    return finish(k);
  });

  /** A slatted park bench with cast-iron ends and a glowing strip under the seat (~2 m). */
  prop('city_bench', (r) => {
    const k = new Kit(r), L = r.range(1.9, 2.1), slat = pick([0xff5fa8, 0x3fc8e8, 0xffb43a, 0x9a6ae8], r, 0.03), iron = 0x2e2b45;
    [-1, 1].forEach((s) => {
      const x = s * (L / 2 - 0.14);
      k.add(new THREE.BoxGeometry(0.09, 0.44, 0.08), iron, { p: [x, 0.22, -0.22] });
      k.add(new THREE.BoxGeometry(0.09, 0.44, 0.08), iron, { p: [x, 0.22, 0.2] });
      k.add(new THREE.BoxGeometry(0.09, 0.06, 0.6), iron, { p: [x, 0.45, -0.01] });
      k.add(new THREE.BoxGeometry(0.09, 0.62, 0.07), iron, { r: [-0.2, 0, 0], p: [x, 0.74, 0.27] });
      k.add(new THREE.BoxGeometry(0.12, 0.06, 0.52), iron, { p: [x, 0.68, -0.02] });
      k.add(new THREE.BoxGeometry(0.08, 0.2, 0.07), iron, { p: [x, 0.57, -0.24] });
    });
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(L, 0.05, 0.12), tone(slat, r, 0.03), { p: [0, 0.5, -0.24 + i * 0.15], jit: 0.02 });
    for (let i = 0; i < 2; i++) k.add(new THREE.BoxGeometry(L, 0.13, 0.05), tone(slat, r, 0.03), { r: [-0.2, 0, 0], p: [0, 0.7 + i * 0.2, 0.29 + i * 0.04], jit: 0.02 });
    k.glow(new THREE.BoxGeometry(L - 0.4, 0.035, 0.05), r.pick([CYAN, PINK, VIOLET]), { p: [0, 0.44, -0.27] });
    return finish(k);
  });

  /** A glowing drinks machine: a lit window of colourful cans, buttons, a neon header (~2.5 m; faces the road). */
  prop('vending_machine', (r) => {
    const k = new Kit(r), body = pick([0xe2303e, 0x2f6ad8, 0xff4f9a, 0x22a6a0], r, 0.02);
    const W = 1.3, H = 2.2, D = 0.85, fz = -D / 2, y0 = 0.12;
    k.add(new THREE.BoxGeometry(W + 0.08, y0, D + 0.08), 0x2a2840, { p: [0, y0 / 2, 0] });
    k.add(new THREE.BoxGeometry(W, H, D), body, { p: [0, y0 + H / 2, 0], grad: 0.14, jit: 0.02 });
    k.add(new THREE.BoxGeometry(W + 0.08, 0.1, D + 0.08), shade(body, 0.12), { p: [0, y0 + H + 0.05, 0] });
    // The display window full of cans.
    const wx = -0.16, wy = 1.36, ww = 0.82, wh = 1.22;
    k.add(new THREE.BoxGeometry(ww + 0.12, wh + 0.12, 0.05), shade(body, -0.22), { p: [wx, wy, fz - 0.015] });
    k.glow(new THREE.PlaneGeometry(ww, wh), 0x5fd0f5, { r: [0, Math.PI, 0], p: [wx, wy, fz - 0.045] });
    const canCols = shuffled([0xe8283a, 0xff7a12, 0x2fcf4a, 0x8a3ae8, 0xff3fa6, 0x1f6ae0], r);
    for (let row = 0; row < 4; row++) {
      const yy = wy - wh / 2 + 0.2 + row * 0.29;
      k.add(new THREE.BoxGeometry(ww, 0.025, 0.12), 0xd8dcef, { p: [wx, yy - 0.1, fz - 0.1] });
      for (let i = 0; i < 5; i++) {
        k.glow(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 7), canCols[(row + i * (row % 2 ? 1 : 2)) % canCols.length], { p: [wx - ww / 2 + 0.1 + i * 0.155, yy, fz - 0.1] });
      }
    }
    // Buttons, coin slot and the pick-up tray.
    const bx = 0.43;
    k.add(new THREE.BoxGeometry(0.28, 0.9, 0.04), 0x24223a, { p: [bx, 1.45, fz - 0.015] });
    for (let i = 0; i < 6; i++) k.glow(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), i % 2 ? 0xff4fae : 0xffcf3a, { r: [HALF_PI, 0, 0], p: [bx, 1.8 - i * 0.11, fz - 0.045] });
    k.glow(new THREE.PlaneGeometry(0.05, 0.14), 0xffa526, { r: [0, Math.PI, 0], p: [bx, 1.1, fz - 0.04] });
    k.add(new THREE.BoxGeometry(0.9, 0.3, 0.06), 0x15142a, { p: [-0.1, 0.42, fz - 0.005] });
    // Neon header with a star.
    k.glow(new THREE.PlaneGeometry(W - 0.12, 0.26), mixHex(PINK, 0x2a1040, 0.25), { r: [0, Math.PI, 0], p: [0, y0 + H - 0.2, fz - 0.012] });
    k.glow(slab(starShape(0.12, 0.05), 0.03), 0xffe45c, { p: [0, y0 + H - 0.2, fz - 0.03] });
    [-1, 1].forEach((s) => k.glow(new THREE.BoxGeometry(0.34, 0.05, 0.02), CYAN, { p: [s * 0.36, y0 + H - 0.2, fz - 0.025] }));
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Neon far ───────────────────────────────────────────────────────── */

  /** Setback office tower with ribbons of lit windows, neon trims and a glowing logo (50–90 m; faces the road). */
  prop('skyscraper', (r) => {
    const k = new Kit(r), H = r.range(54, 88), wall = pick(NAVY, r, 0.03), trim = shade(wall, 0.12);
    const cols = shuffled(NEONS, r), neon = cols[0], neon2 = cols[1];
    const mood = windowMood(r, r.range(0.55, 0.72));
    const w0 = r.range(22, 26), d0 = w0 * 0.86, h0 = 6.5;
    const w1 = r.range(15, 18), d1 = w1 * r.range(0.82, 1), h1 = (H - h0) * 0.6;
    const w2 = w1 * r.range(0.66, 0.76), d2 = d1 * r.range(0.66, 0.76), h2 = (H - h0 - h1) * 0.68;
    const y1 = h0, y2 = y1 + h1, y3 = y2 + h2, h3 = Math.max(4, H - y3 - 3);
    // Podium with a band of lit shop windows and a neon cornice.
    k.add(new THREE.BoxGeometry(w0, h0, d0), shade(wall, -0.03), { p: [0, h0 / 2, 0], jit: 0.02 });
    boxWindows(k, 0, 0, w0, d0, 0.5, 4.2, { floor: 3.6, col: 3.6, gx: 0.5, gy: 0.2, fn: () => r.pick(WIN_WARM) });
    rimGlow(k, 0, 0, w0 + 0.1, d0 + 0.1, h0, 0.36, neon2);
    // Main shaft and the setback above it.
    k.add(new THREE.BoxGeometry(w1, h1, d1), wall, { p: [0, y1 + h1 / 2, 0], grad: 0.1, jit: 0.02 });
    boxWindows(k, 0, 0, w1, d1, y1, h1, { floor: 3.2, col: 2.6, gx: 0.42, gy: 1.05, fn: mood });
    rimGlow(k, 0, 0, w1 + 0.1, d1 + 0.1, y2, 0.42, neon);
    k.add(new THREE.BoxGeometry(w2, h2, d2), wall, { p: [0, y2 + h2 / 2, 0], grad: 0.1, jit: 0.02 });
    boxWindows(k, 0, 0, w2, d2, y2, h2, { floor: 3.2, col: 2.6, gx: 0.42, gy: 1.05, fn: mood });
    rimGlow(k, 0, 0, w2 + 0.1, d2 + 0.1, y3, 0.42, neon2);
    // A glassy crown with glowing corners, and a mast.
    const w3 = w2 * 0.6, d3 = d2 * 0.6;
    k.add(new THREE.BoxGeometry(w3, h3, d3), trim, { p: [0, y3 + h3 / 2, 0], grad: 0.2 });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => k.glow(new THREE.BoxGeometry(0.4, h3, 0.4), neon, { p: [sx * w3 / 2, y3 + h3 / 2, sz * d3 / 2] }));
    rimGlow(k, 0, 0, w3 + 0.2, d3 + 0.2, y3 + h3, 0.4, neon);
    k.add(rod([0, y3 + h3, 0], [0, H, 0], 0.35, 0.12, 5), 0x8c88a8);
    k.glow(ico(0.55, 1), 0xff3a5a, { p: [0, H, 0] });
    // The logo: a glowing disc with a star or heart on the road-facing wall.
    const ly = y2 - 6, lz = -d1 / 2 - 0.2, LR = Math.min(4.2, w1 * 0.26);
    k.glow(new THREE.CircleGeometry(LR, 20), mixHex(neon2, 0x150d30, 0.55), { r: [0, Math.PI, 0], p: [0, ly, lz] });
    k.glow(new THREE.TorusGeometry(LR, 0.28, 4, 24), neon2, { p: [0, ly, lz - 0.05] });
    const logo = r.chance(0.5) ? starShape(LR * 0.7, LR * 0.3) : heartShape(LR * 1.35);
    k.glow(slab(logo, 0.15, 5).rotateY(Math.PI), neon === neon2 ? PINK : neon, { p: [0, ly, lz - 0.15] });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A slender octagonal tower ringed with window bands, cyan fins, a ringed spire and an antenna (60–100 m). */
  prop('skyscraper_slim', (r) => {
    const k = new Kit(r), H = r.range(64, 96), wall = pick(NAVY, r, 0.03);
    const cols = shuffled(NEONS, r), neon = cols[0], neon2 = cols[1];
    const mood = windowMood(r, r.range(0.55, 0.72));
    const R1 = r.range(6.0, 7.0), R2 = R1 * 0.76, h0 = 5;
    const h1 = (H - h0) * 0.5, h2 = (H - h0) * 0.24, y1 = h0, y2 = y1 + h1, y3 = y2 + h2;
    const octo = (R, h, y, col) => k.add(new THREE.CylinderGeometry(R, R, h, 8), col, { p: [0, y + h / 2, 0], grad: 0.1, jit: 0.02 });
    octo(R1 + 2, h0, 0, shade(wall, -0.04));
    octo(R1, h1, y1, wall);
    octo(R2, h2, y2, wall);
    // Window bands on every facet.
    const facets = (R, y, h) => {
      const fw = 2 * R * Math.sin(Math.PI / 8), ap = R * Math.cos(Math.PI / 8) + 0.05;
      const rows = Math.max(1, Math.round((h - 0.6) / 3.2));
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.5) / 8 * TAU, n = [Math.sin(a), 0, Math.cos(a)];
        k.glow(paneGrid(fw - 0.6, rows * 3.2, 2, rows, 0.35, 1.0, () => mood()), null, { m: faceM(n, [0, 1, 0], [n[0] * ap, y + h / 2, n[2] * ap]) });
      }
    };
    facets(R1, y1, h1);
    facets(R2, y2, h2);
    // Glowing fins up two corners, rings at each step.
    [0, Math.PI].forEach((a) => {
      k.glow(new THREE.BoxGeometry(0.45, h1, 0.45), CYAN, { r: [0, a, 0], p: [Math.sin(a) * (R1 + 0.15), y1 + h1 / 2, Math.cos(a) * (R1 + 0.15)] });
      k.glow(new THREE.BoxGeometry(0.4, h2, 0.4), CYAN, { r: [0, a, 0], p: [Math.sin(a) * (R2 + 0.15), y2 + h2 / 2, Math.cos(a) * (R2 + 0.15)] });
    });
    k.glow(new THREE.CylinderGeometry(R1 + 2.1, R1 + 2.1, 0.5, 8, 1, true), neon2, { p: [0, h0 - 0.3, 0] });
    k.glow(new THREE.CylinderGeometry(R1 + 0.12, R1 + 0.12, 0.6, 8, 1, true), neon, { p: [0, y2, 0] });
    k.glow(new THREE.CylinderGeometry(R2 + 0.12, R2 + 0.12, 0.6, 8, 1, true), neon, { p: [0, y3, 0] });
    // The spire: a stepped cone with glowing rings and an antenna with a beacon.
    const sh = (H - y3) * 0.62;
    k.add(new THREE.CylinderGeometry(R2 * 0.18, R2 * 0.92, sh, 8), shade(wall, 0.1), { p: [0, y3 + sh / 2, 0], grad: 0.2 });
    for (let i = 1; i <= 3; i++) {
      const t = i / 4, rr = R2 * 0.92 + (R2 * 0.18 - R2 * 0.92) * t + 0.12;
      k.glow(new THREE.CylinderGeometry(rr, rr + 0.05, 0.45, 8, 1, true), i % 2 ? neon2 : neon, { p: [0, y3 + sh * t, 0] });
    }
    k.add(rod([0, y3 + sh, 0], [0, H, 0], 0.32, 0.1, 5), 0x9a96b8);
    k.glow(ico(0.6, 1), 0xff3a5a, { p: [0, H, 0] });
    return finish(k);
  });

  /** One of three cheerful glowing pictures for the billboards, w × h facing -Z at (cx, cy, z). */
  function billboardArt(k, kind, w, h, cx, cy, z) {
    const r = k.rng, top = 0x2a1466, bot = 0x0e2a6a;
    k.glow(new THREE.PlaneGeometry(w, h, 1, 6), (x, y) => mixHex(bot, top, (y + h / 2) / h), { r: [0, Math.PI, 0], p: [cx, cy, z] });
    const at = (x, y, dz) => [cx - x, cy + y, z - dz];
    const front = (geo, col, x, y, dz, o) => k.glow(geo.rotateY(Math.PI), col, Object.assign({ p: at(x, y, dz) }, o || {}));
    const R = h * 0.36;
    if (kind === 0) {
      // A beaming sun face.
      front(new THREE.CircleGeometry(R * 1.12, 24), 0xff8a1a, 0, 0, 0.04);
      front(new THREE.CircleGeometry(R, 24), 0xffc61f, 0, 0, 0.08);
      [-1, 1].forEach((s) => {
        front(new THREE.CircleGeometry(R * 0.13, 10), 0x3a1440, s * R * 0.36, R * 0.18, 0.12, { s: [1, 1.3, 1] });
        front(new THREE.CircleGeometry(R * 0.045, 6), WHITE, s * R * 0.36 + R * 0.04, R * 0.27, 0.16);
        front(new THREE.CircleGeometry(R * 0.14, 10), 0xff5a8a, s * R * 0.6, -R * 0.15, 0.12);
      });
      front(arcGeo(R * 0.42, R * 0.06, 2.4).scale(1, 1, 0.2), 0x3a1440, 0, -R * 0.12, 0.13);
    } else if (kind === 1) {
      // A big heart with a shine.
      front(slab(heartShape(R * 2.5), 0.1, 6), 0xff2f8f, 0, 0, 0.06);
      front(new THREE.CircleGeometry(R * 0.2, 10), 0xffa6d2, -R * 0.45, R * 0.35, 0.14, { s: [1, 0.7, 1] });
      front(slab(heartShape(R * 0.7), 0.1, 4), 0x9a40ff, R * 1.45, R * 0.5, 0.06);
      front(slab(heartShape(R * 0.55), 0.1, 4), 0x18c8f2, -R * 1.5, -R * 0.45, 0.06);
    } else {
      // An ice-cream cone with two scoops and a cherry.
      front(slab(polyShape([[-R * 0.45, R * 0.05], [R * 0.45, R * 0.05], [0, -R * 1.25]]), 0.08), 0xe89a3a, 0, -R * 0.05, 0.05);
      front(new THREE.CircleGeometry(R * 0.5, 16), 0x5ff0b0, -R * 0.02, R * 0.3, 0.08);
      front(new THREE.CircleGeometry(R * 0.44, 16), 0xff6ab8, 0.02 * R, R * 0.82, 0.11);
      front(new THREE.CircleGeometry(R * 0.14, 10), 0xff2a3a, R * 0.08, R * 1.32, 0.14);
    }
    // Sparkles round the picture.
    for (let i = 0; i < 6; i++) {
      const sx = (i % 3 - 1) * w * 0.38 + r.range(-0.6, 0.6), sy = (i < 3 ? 1 : -1) * h * 0.34 + r.range(-0.3, 0.3);
      if (Math.abs(sx) < R * 1.3 && Math.abs(sy) < R * 1.2) continue;
      front(slab(starShape(h * 0.07, h * 0.022, 4), 0.06), i % 2 ? 0xffe45c : 0x7fe8ff, sx, sy, 0.06);
    }
  }

  /** A giant glowing billboard on a single pole with a catwalk (~30 m; faces the road). */
  prop('billboard_tower', (r) => {
    const k = new Kit(r), steel = pick([0x3c3a5e, 0x463c66], r, 0.02), neon = r.pick(NEONS);
    const BW = r.range(16, 18), BH = BW * 0.56, poleH = r.range(17, 18.5), by = poleH + 1.6 + BH / 2;
    k.add(new THREE.CylinderGeometry(1.7, 2.1, 1.0, 8), 0x55506e, { p: [0, 0.5, 0] });
    k.add(new THREE.CylinderGeometry(0.75, 0.95, poleH + 1, 8), steel, { p: [0, (poleH + 1) / 2 + 0.5, 0.6], grad: 0.15 });
    k.add(new THREE.BoxGeometry(BW * 0.75, 1.0, 1.0), steel, { p: [0, poleH + 1.2, 0.6] });
    // The board, its glowing picture and a neon frame.
    k.add(new THREE.BoxGeometry(BW + 0.6, BH + 0.6, 0.9), shade(steel, -0.05), { p: [0, by, 0.6], jit: 0.02 });
    billboardArt(k, r.int(0, 2), BW - 0.4, BH - 0.4, 0, by, 0.6 - 0.46);
    const fz = 0.6 - 0.5, bw = BW / 2 + 0.05, bh = BH / 2 + 0.05;
    neonLine(k, [[-bw, by - bh, fz], [bw, by - bh, fz], [bw, by + bh, fz], [-bw, by + bh, fz]], 0.22, neon, true);
    // Catwalk with railings and four lamps shining up at the board.
    const cw = poleH + 1.0;
    k.add(new THREE.BoxGeometry(BW + 0.4, 0.18, 1.8), shade(steel, 0.1), { p: [0, cw, -0.85] });
    k.add(new THREE.BoxGeometry(BW + 0.4, 0.1, 0.1), shade(steel, 0.15), { p: [0, cw + 1.0, -1.7] });
    for (let i = 0; i <= 6; i++) k.add(new THREE.BoxGeometry(0.1, 1.0, 0.1), shade(steel, 0.15), { p: [-BW / 2 - 0.1 + i * (BW + 0.2) / 6, cw + 0.5, -1.7] });
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * BW * 0.28;
      k.add(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 6), 0x24223a, { r: [0.5, 0, 0], p: [x, cw + 0.4, -1.25] });
      k.glow(new THREE.CircleGeometry(0.24, 8), 0xffe9a0, { r: [-HALF_PI + 0.5, 0, 0], p: [x, cw + 0.62, -1.12] });
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A chunky apartment block: lit windows, balconies, glowing shopfronts, a rooftop water tank (~30 m). */
  prop('apartment_block', (r) => {
    const k = new Kit(r), wall = pick([0x4a3a6e, 0x3a4470, 0x563c66, 0x3c3c6a], r, 0.03), trim = shade(wall, 0.14);
    const W = r.range(22, 25), D = r.range(12, 13.5), floors = r.int(7, 8), fh = 3.3, gH = 4.4, H = gH + floors * fh;
    k.add(new THREE.BoxGeometry(W, H, D), wall, { p: [0, H / 2, 0], grad: 0.14, jit: 0.02 });
    k.add(new THREE.BoxGeometry(W + 0.5, 0.5, D + 0.5), trim, { p: [0, gH, 0] });
    k.add(new THREE.BoxGeometry(W + 0.7, 0.8, D + 0.7), trim, { p: [0, H + 0.4, 0] });
    // Windows: warm homes, a few cool TV-lit ones, a few dark.
    const homes = [0xffbf45, 0xffbf45, 0xffad30, 0xff8a4a, 0x45c8f5, 0xff5cc0];
    boxWindows(k, 0, 0, W, D, gH + 0.4, floors * fh, { floor: fh, col: 3.0, gx: 1.25, gy: 1.2, vm: 0, hm: 0.8,
      fn: () => (r.chance(0.72) ? r.pick(homes) : WIN_DARK) });
    // Balconies on the front, in two stacks.
    const bxs = [-W * 0.25, W * 0.25].map((x) => Math.round(x / 3) * 3 + (Math.round((W - 1.6) / 3) % 2 ? 0 : 1.5));
    for (let f = 0; f < floors; f++) {
      const y = gH + 0.4 + f * fh + 0.2;
      bxs.forEach((x) => {
        k.add(new THREE.BoxGeometry(2.8, 0.2, 1.2), trim, { p: [x, y, -D / 2 - 0.6] });
        k.add(new THREE.BoxGeometry(2.8, 0.75, 0.08), shade(wall, 0.25), { p: [x, y + 0.45, -D / 2 - 1.17] });
      });
    }
    // Ground floor: three glowing shopfronts with striped awnings.
    const shopCols = shuffled([PINK, CYAN, AMBER, VIOLET], r);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * W / 3, sw = W / 3 - 1.4;
      k.glow(new THREE.PlaneGeometry(sw, 2.3), r.pick(WIN_WARM), { r: [0, Math.PI, 0], p: [x, 1.55, -D / 2 - 0.04] });
      const awn = new THREE.BoxGeometry(sw + 0.4, 0.12, 1.5, 6, 1, 1);
      k.add(awn, (cx) => (Math.floor((cx - x + sw) / ((sw + 0.4) / 6)) % 2 ? WHITE : mixHex(shopCols[i], WHITE, 0.15)), { r: [-0.3, 0, 0], p: [x, 3.1, -D / 2 - 0.68] });
      k.glow(new THREE.BoxGeometry(sw * 0.6, 0.4, 0.1), shopCols[i], { p: [x, 3.75, -D / 2 - 0.1] });
    }
    // Roof: a water tank on legs and a couple of vents.
    const tx = r.range(-W * 0.25, W * 0.25), tz = r.range(-1, 1);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4;
      k.add(rod([tx + Math.cos(a) * 1.4, H + 0.8, tz + Math.sin(a) * 1.4], [tx + Math.cos(a) * 1.2, H + 3.4, tz + Math.sin(a) * 1.2], 0.12, 0.1, 4), 0x2a2840);
    }
    k.add(new THREE.CylinderGeometry(1.9, 1.9, 3.0, 10), 0x8a5a3e, { p: [tx, H + 4.9, tz], jit: 0.04 });
    k.add(new THREE.ConeGeometry(2.1, 1.3, 10), 0x5a3a2e, { p: [tx, H + 7.05, tz] });
    k.add(new THREE.BoxGeometry(2.4, 1.4, 1.8), 0x6a6488, { p: [-tx * 0.8 + 2, H + 1.5, r.range(-2, 2)] });
    k.glow(new THREE.TorusGeometry(1.92, 0.12, 4, 14), r.pick(NEONS), { r: [HALF_PI, 0, 0], p: [tx, H + 4.1, tz] });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Neon landmarks ─────────────────────────────────────────────────── */

  /** A 120 m spire: glowing rings and edge lines, a lit sky deck, two neon rings orbiting it, a star on top. */
  prop('neon_tower', (r) => {
    const k = new Kit(r), wall = pick([0x2e2a62, 0x352c6c, 0x2a3266], r, 0.02);
    const cols = shuffled([PINK, CYAN, VIOLET], r), c1 = cols[0], c2 = cols[1], c3 = cols[2];
    // Stepped octagonal plinth with a glowing band.
    k.add(new THREE.CylinderGeometry(14, 16, 4, 8), shade(wall, -0.03), { p: [0, 2, 0], jit: 0.02 });
    k.add(new THREE.CylinderGeometry(10.5, 12.5, 4, 8), wall, { p: [0, 6, 0], jit: 0.02 });
    k.glow(new THREE.CylinderGeometry(16.05, 16.05, 0.7, 8, 1, true), c2, { p: [0, 1.0, 0] });
    k.glow(new THREE.CylinderGeometry(14.05, 14.05, 0.6, 8, 1, true), c1, { p: [0, 3.7, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU, ap = 11.6 * Math.cos(Math.PI / 8) + 0.05;
      k.glow(new THREE.PlaneGeometry(3.2, 2.2), r.pick(WIN_WARM), { r: [0, a, 0], p: [Math.sin(a) * ap, 5.9, Math.cos(a) * ap] });
    }
    // The shaft: a tapering octagon with glowing lines up four edges and rings round it.
    const y0 = 8, y1 = 82, rb = 8, rt = 3.8;
    const radAt = (y) => rb + (rt - rb) * (y - y0) / (y1 - y0);
    k.add(new THREE.CylinderGeometry(rt, rb, y1 - y0, 8, 3), wall, { p: [0, (y0 + y1) / 2, 0], grad: 0.25, jit: 0.02 });
    for (let i = 0; i < 8; i += 2) {
      const a = i / 8 * TAU;
      k.glow(bar([Math.sin(a) * (rb + 0.12), y0, Math.cos(a) * (rb + 0.12)], [Math.sin(a) * (rt + 0.12), y1, Math.cos(a) * (rt + 0.12)], 0.5), i % 4 ? c1 : c2);
    }
    for (let i = 0; i < 5; i++) {
      const y = y0 + 9 + i * 13.5;
      k.glow(new THREE.TorusGeometry(radAt(y) + 0.8, 0.45, 5, 24), i % 2 ? c1 : c2, { r: [HALF_PI, 0, 0], p: [0, y, 0] });
    }
    // The sky deck: a lit window band between a cone underside and a sloped roof.
    k.add(new THREE.CylinderGeometry(9.5, rt, 6, 16), shade(wall, 0.05), { p: [0, y1 + 3, 0] });
    const deckY = y1 + 7.4;
    k.glow(new THREE.CylinderGeometry(9.5, 9.5, 2.8, 16, 1, true), (cx, cy, cz) => {
      const s = Math.floor(((Math.atan2(cx, cz) / TAU) + 1) * 16) % 16;
      return s % 4 === 3 ? c3 : s % 2 ? WIN_WARM[0] : WIN_WARM[2];
    }, { p: [0, deckY, 0] });
    k.add(new THREE.CylinderGeometry(9.9, 9.9, 0.6, 16), shade(wall, 0.12), { p: [0, deckY - 1.7, 0] });
    k.add(new THREE.CylinderGeometry(6.0, 9.9, 3.0, 16), shade(wall, 0.1), { p: [0, deckY + 2.9, 0], grad: 0.2 });
    k.glow(new THREE.TorusGeometry(9.95, 0.3, 4, 32), c1, { r: [HALF_PI, 0, 0], p: [0, deckY + 1.45, 0] });
    // The needle with small rings and a double star on top.
    const ny0 = deckY + 4.4, ny1 = 116;
    k.add(new THREE.CylinderGeometry(0.5, 2.8, ny1 - ny0, 8), shade(wall, 0.14), { p: [0, (ny0 + ny1) / 2, 0], grad: 0.3 });
    for (let i = 1; i <= 3; i++) {
      const t = i / 4, rr = 2.8 + (0.5 - 2.8) * t;
      k.glow(new THREE.TorusGeometry(rr + 0.35, 0.22, 4, 14), i % 2 ? c2 : c1, { r: [HALF_PI, 0, 0], p: [0, ny0 + (ny1 - ny0) * t, 0] });
    }
    [0, HALF_PI].forEach((a) => k.glow(slab(starShape(2.6, 1.1), 0.5), 0xffd84a, { r: [0, a, 0], p: [0, ny1 + 1.6, 0] }));
    // Two tilted neon rings orbit the sky deck.
    const node = new THREE.Group();
    k.add(new THREE.TorusGeometry(15, 0.55, 5, 40), c1, { mat: GLOW(), noInk: true, r: [HALF_PI + 0.42, 0, 0], p: [0, deckY, 0] }, node);
    k.add(new THREE.TorusGeometry(13, 0.5, 5, 40), c3, { mat: GLOW(), noInk: true, r: [HALF_PI - 0.3, 0.5, 0], order: 'YXZ', p: [0, deckY, 0] }, node);
    const rings = keep(node);
    k.root.add(rings);
    spin(k, rings, 'y', 0.32, r.range(0, TAU));
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /**
   * Draw in "sign space" for a sign facing -Z: u to the viewer's right, v up,
   * d toward the viewer. Geometry built in the XY plane (front +Z) is turned
   * to face -Z and placed at (u, v) with offset `org`.
   */
  function signPart(k, geo, col, u, v, d, org, parent, o) {
    geo.rotateY(Math.PI);
    return k.glow(geo, col, Object.assign({ p: [org[0] - u, org[1] + v, org[2] - d] }, o || {}), parent);
  }
  function signTube(k, pts2, r, col, d, org, closed, segs, parent) {
    const pts = pts2.map((p) => [org[0] - p[0], org[1] + p[1], org[2] - d]);
    return k.glow(tubeGeo(pts, r, segs || pts.length * 3, 6, closed), col, {}, parent);
  }
  const ellipsePts = (cu, cv, ru, rv, n, a0, a1) => {
    const out = [];
    const from = a0 === undefined ? 0 : a0, to = a1 === undefined ? TAU : a1, closed = a1 === undefined;
    for (let i = 0; i < (closed ? n : n + 1); i++) { const a = from + (to - from) * i / n; out.push([cu + Math.cos(a) * ru, cv + Math.sin(a) * rv]); }
    return out;
  };

  /** A huge friendly neon cat on a rooftop frame, waving its paw (~30 m; faces the road). */
  prop('giant_cat_sign', (r) => {
    const k = new Kit(r), roof = pick([0x3a3266, 0x33306a], r, 0.02), iron = 0x2a2840;
    const fill = 0x5a1f9a, line = CYAN, feat = PINK, collar = 0xff3a4a, bell = 0xffc61f;
    // The rooftop the sign stands on.
    const RW = 26, RH = 7, RD = 14;
    k.add(new THREE.BoxGeometry(RW, RH, RD), roof, { p: [0, RH / 2, 2], grad: 0.15, jit: 0.02 });
    k.add(new THREE.BoxGeometry(RW + 0.6, 0.9, RD + 0.6), shade(roof, 0.14), { p: [0, RH + 0.45, 2] });
    boxWindows(k, 0, 2, RW, RD, 0.6, RH - 1.4, { floor: 3.0, col: 3.2, gx: 1.0, gy: 0.9, vm: 0, fn: () => (r.chance(0.75) ? r.pick(WIN_WARM) : WIN_DARK) });
    k.add(new THREE.BoxGeometry(3, 2.6, 3), shade(roof, 0.08), { p: [-9, RH + 2.2, 6] });
    k.add(new THREE.BoxGeometry(2.4, 1.4, 2.0), 0x6a6488, { p: [8.5, RH + 1.6, 6.5] });
    // Lattice towers and beams behind the sign.
    const fz = 1.6, top = 29;
    [-6.5, 6.5].forEach((x) => {
      [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]].forEach(([dx, dz]) => k.add(bar([x + dx, RH + 0.9, fz + 1 + dz], [x + dx, top - 2, fz + 1 + dz], 0.28), iron));
      for (let y = RH + 0.9, i = 0; y < top - 3; y += 3.2, i++) {
        const y2 = Math.min(top - 2, y + 3.2);
        [-1, 1].forEach((sx) => k.add(bar([x + sx * 0.9, y, fz + 1 - 0.9 * (i % 2 ? 1 : -1)], [x + sx * 0.9, y2, fz + 1 + 0.9 * (i % 2 ? 1 : -1)], 0.16), iron));
        k.add(bar([x - 0.9, y, fz + 0.1], [x + 0.9, y2, fz + 0.1], 0.16), iron);
      }
    });
    [RH + 5, 19, top - 2.4].forEach((y) => k.add(new THREE.BoxGeometry(15, 0.5, 0.5), iron, { p: [0, y, fz + 0.2] }));
    // The cat, drawn in sign space: origin at the middle of the bottom of the body.
    const O = [0, RH + 2.2, 0];
    const body = new THREE.Shape();
    body.absellipse(0, 4.3, 5.2, 4.6, 0, TAU, false, 0);
    signPart(k, slab(body, 0.12, 8), fill, 0, 0, 0.05, O);
    signTube(k, ellipsePts(0, 4.3, 5.2, 4.6, 26), 0.32, line, 0.45, O, true);
    // Tail curling up the viewer's left.
    signTube(k, [[-4.6, 1.6], [-7.2, 2.6], [-8.0, 5.6], [-7.0, 8.4], [-5.6, 8.6], [-5.4, 7.4]], 0.5, line, 0.45, O, false, 30);
    // Ears behind the head.
    [-1, 1].forEach((s) => {
      const ear = [[s * 1.4, 15.6], [s * 4.2, 19.6], [s * 5.4, 13.4]];
      signPart(k, slab(polyShape(ear), 0.12), fill, 0, 0, 0.05, O);
      signPart(k, slab(polyShape([[s * 2.3, 15.6], [s * 4.0, 18.3], [s * 4.7, 14.4]]), 0.12), 0xd8238a, 0, 0, 0.12, O);
      signTube(k, ear, 0.3, line, 0.45, O, true, 18);
    });
    // Head.
    const head = new THREE.Shape();
    head.absellipse(0, 12.0, 5.6, 5.0, 0, TAU, false, 0);
    signPart(k, slab(head, 0.12, 10), fill, 0, 0, 0.85, O);
    signTube(k, ellipsePts(0, 12.0, 5.6, 5.0, 28), 0.34, line, 1.1, O, true);
    // Happy closed eyes, a pink nose, an "ω" mouth, rosy cheeks, whiskers.
    [-1, 1].forEach((s) => {
      signTube(k, ellipsePts(s * 2.2, 12.3, 1.05, 1.0, 6, 0.15, Math.PI - 0.15), 0.26, feat, 1.0, O, false, 12);
      signPart(k, new THREE.CircleGeometry(0.85, 12), 0xff5aa8, s * 3.5, 10.4, 0.95, O);
      signTube(k, ellipsePts(s * 0.62, 10.35, 0.62, 0.55, 6, Math.PI, TAU), 0.2, feat, 1.0, O, false, 12);
      [[11.2, 12.0], [10.6, 10.6], [10.0, 9.2]].forEach(([v0, v1]) => signTube(k, [[s * 3.4, v0], [s * 5.4, (v0 + v1) / 2 + 0.1], [s * 7.4, v1]], 0.15, line, 1.0, O, false, 8));
    });
    signPart(k, slab(polyShape([[-0.55, 11.35], [0.55, 11.35], [0, 10.75]]), 0.1), feat, 0, 0, 1.0, O);
    // A collar with a golden bell, and the resting paw.
    signTube(k, ellipsePts(0, 9.6, 4.1, 2.2, 10, Math.PI + 0.55, TAU - 0.55), 0.42, collar, 1.0, O, false, 20);
    signPart(k, new THREE.CircleGeometry(0.95, 12), bell, 0, 7.0, 1.15, O);
    signPart(k, new THREE.CircleGeometry(0.35, 8), 0x7a4a10, 0, 6.75, 1.2, O);
    const rest = new THREE.Shape();
    rest.absellipse(-2.4, 1.4, 1.7, 1.2, 0, TAU, false, 0);
    signPart(k, slab(rest, 0.1, 6), fill, 0, 0, 0.6, O);
    signTube(k, ellipsePts(-2.4, 1.4, 1.7, 1.2, 14), 0.24, line, 0.7, O, true);
    // The raised, waving paw: its own node pivoting at the shoulder.
    const piv = [4.0, 7.6], pn = new THREE.Group(), PO = [0, 0, 0];
    const arm = (u, v) => [u - piv[0], v - piv[1]];
    const pawShape = new THREE.Shape();
    const ap = [arm(3.0, 7.0), arm(5.0, 6.4), arm(7.6, 12.0), arm(5.6, 12.8)];
    pawShape.moveTo(ap[0][0], ap[0][1]); ap.slice(1).forEach((p) => pawShape.lineTo(p[0], p[1])); pawShape.closePath();
    signPart(k, slab(pawShape, 0.1), fill, 0, 0, 1.5, PO, pn);
    const pawTip = new THREE.Shape();
    const pc = arm(6.7, 13.4);
    pawTip.absellipse(pc[0], pc[1], 1.9, 2.1, 0, TAU, false, 0);
    signPart(k, slab(pawTip, 0.1, 8), fill, 0, 0, 1.6, PO, pn);
    signTube(k, [ap[0], ap[1], arm(7.4, 11.6)], 0.3, line, 1.7, PO, false, 10, pn);
    signTube(k, ellipsePts(pc[0], pc[1], 1.9, 2.1, 16), 0.3, line, 1.8, PO, true, 0, pn);
    signPart(k, new THREE.CircleGeometry(0.75, 10), feat, pc[0], pc[1] - 0.4, 1.75, PO, pn);
    [-0.85, 0, 0.85].forEach((du, i) => signPart(k, new THREE.CircleGeometry(0.34, 8), feat, pc[0] + du, pc[1] + 1.0 + (i === 1 ? 0.25 : 0), 1.75, PO, pn));
    pn.position.set(O[0] - piv[0], O[1] + piv[1], O[2]);
    const paw = keep(pn);
    k.root.add(paw);
    sway(k, paw, 'z', 2.4, 0.32, r.range(0, TAU));
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Neon hazards ───────────────────────────────────────────────────── */

  /** Clip a polygon [[x, y], …] to the rectangle x0..x1, y0..y1 (Sutherland–Hodgman). */
  function clipRect(poly, x0, x1, y0, y1) {
    const planes = [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]];
    let out = poly;
    for (const [ax, v, sg] of planes) {
      const inp = out;
      out = [];
      for (let i = 0; i < inp.length; i++) {
        const a = inp[i], b = inp[(i + 1) % inp.length];
        const ia = (a[ax] - v) * sg >= 0, ib = (b[ax] - v) * sg >= 0;
        if (ia) out.push(a);
        if (ia !== ib) {
          const t = (v - a[ax]) / (b[ax] - a[ax]);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      if (out.length < 3) return [];
    }
    return out;
  }
  /** A board L × H × T of crisp diagonal stripes (alternating cols), centred, front +Z; placed by matrix M. */
  function stripeBoard(k, L, H, T, w, cols, M, parent, dir) {
    const sl = w * Math.SQRT2, sgn = dir || 1;
    let i = 0;
    for (let c = -L / 2 - H - sl; c < L / 2 + H; c += sl, i++) {
      const quad = [[c, -H / 2], [c + sl, -H / 2], [c + sl + H * sgn, H / 2], [c + H * sgn, H / 2]];
      const poly = clipRect(quad, -L / 2, L / 2, -H / 2, H / 2);
      if (poly.length < 3) continue;
      k.add(slab(polyShape(poly), T), cols[((i % 2) + 2) % 2], { m: M }, parent);
    }
  }

  /** Block: an A-frame road barricade with orange-and-white striped boards and two steady amber lamps. */
  hazard('road_barrier', 'block', 'neon', (r) => {
    const k = new Kit(r, true), orange = 0xff6a1a, white = 0xfaf6ff, frame = 0xe9e6f2, rubber = 0x2a2838;
    const top = 1.9, zt = 0.16, zf = 1.2, hw = 1.15;
    const L = Math.hypot(top, zf - zt), uy = top / L, uz = (zf - zt) / L;
    [-1, 1].forEach((s) => {
      [-hw, hw].forEach((x) => {
        k.add(bar([x, top + 0.05, s * zt], [x, 0.08, s * zf], 0.16), frame);
        k.add(new THREE.BoxGeometry(0.42, 0.16, 0.5), rubber, { p: [x, 0.08, s * (zf + 0.02)] });
      });
      // Two striped boards on each face of the A.
      const n = [0, uz, s * uy], up = [0, uy, -s * uz];
      [0.3, 0.68].forEach((t, j) => {
        const y = top - t * top, z = s * (zt + t * (zf - zt));
        const M = faceM(n, up, [0, y + n[1] * 0.1, z + n[2] * 0.1]);
        stripeBoard(k, 2.8, 0.44, 0.08, 0.36, [orange, white], M, null, j ? -1 : 1);
      });
    });
    k.add(new THREE.BoxGeometry(2.5, 0.12, 0.36), frame, { p: [0, top + 0.08, 0] });
    // Steady amber lamps on top.
    [-0.85, 0.85].forEach((x) => {
      k.add(new THREE.BoxGeometry(0.12, 0.2, 0.12), rubber, { p: [x, top + 0.24, 0] });
      k.add(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12), 0xffb21f, { r: [HALF_PI, 0, 0], p: [x, top + 0.52, 0] });
      [-1, 1].forEach((s) => k.glow(new THREE.CircleGeometry(0.19, 12), 0xffd23a, { r: [0, s > 0 ? 0 : Math.PI, 0], p: [x, top + 0.52, s * 0.105] }));
    });
    const out = sizeHazard(k, [2.8, 2.45, 2.6]);
    shadow(out, 3.4, 3.1);
    return out;
  });

  /** Roller: a big bouncy tyre with a whitewall, chunky tread and a bright star hubcap (axle along Z). */
  hazard('rolling_tire', 'roller', 'neon', (r) => {
    const k = new Kit(r, true), R = 1.0, rubber = 0x2c2a3c, wall = 0xf2eeff;
    const hubCols = r.pick([[0xff3fa6, 0xffd23f, 0x18c8f2], [0x18c8f2, 0xffd23f, 0xff3fa6], [0xffb21f, 0xff3fa6, 0x9a40ff]]);
    const node = new THREE.Group();
    const prof = [[0.56, -0.36], [0.62, -0.44], [0.72, -0.45], [0.8, -0.45], [0.88, -0.44], [0.96, -0.36], [0.99, -0.22], [1.0, -0.11], [1.0, 0],
      [1.0, 0.11], [0.99, 0.22], [0.96, 0.36], [0.88, 0.44], [0.8, 0.45], [0.72, 0.45], [0.62, 0.44], [0.56, 0.36]];
    const tyre = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 36).rotateX(HALF_PI);
    // Rubber with a whitewall ring and a chevron tread painted round the crown.
    k.add(tyre, (cx, cy, cz) => {
      const rr = Math.hypot(cx, cy);
      if (Math.abs(cz) > 0.43 && rr > 0.7 && rr < 0.82) return wall;
      if (rr > 0.97) return (Math.floor((Math.atan2(cy, cx) / TAU + 1) * 18 + Math.abs(cz) * 2.2) & 1) ? 0x44405c : rubber;
      return rubber;
    }, { jit: 0.03 }, node);
    // Hubcaps on both faces: a rim, a five-spoke star and a round cap.
    k.add(new THREE.CylinderGeometry(0.58, 0.58, 0.8, 18), hubCols[0], { r: [HALF_PI, 0, 0] }, node);
    [-1, 1].forEach((s) => {
      k.add(new THREE.TorusGeometry(0.52, 0.05, 4, 18), 0xe8e6f4, { p: [0, 0, s * 0.41] }, node);
      k.add(slab(starShape(0.46, 0.2), 0.08), hubCols[1], { r: [0, s > 0 ? 0 : Math.PI, 0], p: [0, 0, s * 0.44] }, node);
      k.add(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 10), hubCols[2], { r: [HALF_PI, 0, 0], p: [0, 0, s * 0.5] }, node);
    });
    return finishRoller(k, node, R, 0.045);
  });

  /**
   * A soft steam plume 6 m tall and 1.6 m wide, rising from y = 0: a pale
   * core wrapped in three spiralling strands of puffs that swell with height,
   * a round cloud on top. Inked and welded, ready for geyserRig.
   */
  function steamColumn(r, cols, y0) {
    const ck = new Kit(r, true);
    ck.add(new THREE.CylinderGeometry(0.5, 0.3, 5.3 - y0, 10, 4), cols[0], { p: [0, y0 + (5.3 - y0) / 2, 0], jit: 0.02 });
    let i = 0;
    for (let y = y0 + 0.5; y < 5.0; y += 0.68, i++) {
      const t = (y - y0) / (5.4 - y0), R = 0.28 + 0.2 * t, d = 0.2 + 0.14 * t;
      for (let j = 0; j < 3; j++) {
        const a = i * 0.9 + j / 3 * TAU;
        puff(ck, Math.cos(a) * d, y, Math.sin(a) * d, R * r.range(0.92, 1.08), 0.82, cols, 7);
      }
    }
    for (let j = 0; j < 5; j++) { const a = j / 5 * TAU + 0.3; puff(ck, Math.cos(a) * 0.4, 5.42, Math.sin(a) * 0.4, 0.4, 0.8, cols, 9); }
    puff(ck, 0, 5.68, 0, 0.46, 0.75, cols, 9);
    A.ink(ck.root, 0.045);
    return flagInk(A.mergeByMaterial(ck.root));
  }

  /** Geyser: a manhole cover with a star badge that blasts a 6 m column of soft lilac steam. */
  hazard('steam_manhole', 'geyser', 'neon', (r) => {
    const k = new Kit(r, true), iron = 0x4a4860, deep = 0x34324a;
    k.add(new THREE.CylinderGeometry(0.98, 1.04, 0.08, 20), 0xffc21f, { p: [0, 0.04, 0] });
    k.add(new THREE.CylinderGeometry(0.84, 0.86, 0.12, 20), iron, { p: [0, 0.07, 0] });
    const grid = paintFaces(disc([0.2, 0.38, 0.52, 0.66, 0.78], 20), (cx, cy, cz) =>
      (((Math.floor(cx * 5 + 10) + Math.floor(cz * 5 + 10)) & 1) ? deep : shade(iron, 0.08)), r, {});
    k.add(grid, null, { p: [0, 0.135, 0], noInk: true });
    k.add(slab(starShape(0.34, 0.15), 0.05), 0x9a96c0, { r: [-HALF_PI, 0, 0], p: [0, 0.16, 0], noInk: true });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6), 0x2a2838, { p: [Math.cos(a) * 0.92, 0.1, Math.sin(a) * 0.92] });
    }
    A.ink(k.root, 0.035);
    const out = finish(k);
    return geyserRig(out, steamColumn(r, [0xfaf6ff, 0xd8c8f5], 0.1));
  });

  /** Puddle: a dark oil slick with swirling rainbow sheen bands. */
  hazard('oil_slick', 'puddle', 'neon', (r) => {
    const k = new Kit(r, true), HW = 1.8, HL = 3.0, dark = 0x1e1a30, dark2 = 0x2a2442;
    const bands = [0x9a5cff, 0x3f8cff, 0x2fd6c8, 0x9be84a, 0xffd23f, 0xff6aa8];
    const p1 = r.range(0, TAU), p2 = r.range(0, TAU);
    const radii = [];
    for (let i = 1; i <= 13; i++) radii.push(i / 14);
    radii.push(0.955, 1);
    puddleBase(k, radii, (rho, x, z) => {
      const a = Math.atan2(z, x), s = rho * 2.0 + 0.32 * Math.sin(2 * a + p1) + 0.18 * Math.sin(3 * a + p2);
      const f = s - Math.floor(s);
      if (rho < 0.12) return dark2;
      return f > 0.52 && f < 0.94 ? bands[Math.min(5, Math.floor((f - 0.52) / 0.07))] : (f < 0.25 ? dark : dark2);
    }, 0x0e0c18, HW, HL);
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.CircleGeometry(1, 10), 0xf4f0ff, { s: [0.22 - i * 0.04, 0.08, 1], r: [-HALF_PI, 0, r.range(0, TAU)], p: [r.range(-0.6, 0.6), 0.035, r.range(-1.6, 1.6)], noInk: true });
    }
    for (let i = 0; i < 6; i++) {
      const a = r.range(0, TAU), rad = r.range(0.12, 0.2);
      k.add(new THREE.SphereGeometry(rad, 8, 4, 0, TAU, 0, HALF_PI), dark2, { s: [1.3, 0.5, 1.3], p: [Math.cos(a) * HW * 0.82, 0.02, Math.sin(a) * HL * 0.84] });
    }
    A.ink(k.root, 0.03);
    return finish(k, 0.02);
  });

  /* ── Neon street dressing (origin on the street, 30 m below the rooftops) ── */

  /** A cute rounded car with glowing headlights and tail lights (~4.5 m), in one of six bright paints. */
  prop('traffic_car', (r) => {
    const k = new Kit(r), paints = [0xffc21f, 0xff4f9a, 0x34c8b0, 0xff7a2a, 0x3f7ae8, 0x9a5ae0];
    const paint = pick(paints, r, 0.02), taxi = paint === paints[0] || r.chance(0.08);
    const glass = 0x26305a, tyre = 0x22202e;
    k.add(roundBox(1.95, 0.95, 4.4, 0.32, 14, 8), paint, { p: [0, 0.82, 0], grad: 0.2, jit: 0.02 });
    k.add(roundBox(1.6, 0.8, 2.3, 0.45, 12, 8), glass, { p: [0, 1.55, 0.25], jit: 0.02 });
    k.add(roundBox(1.72, 0.26, 2.38, 0.5, 12, 6), shade(paint, 0.06), { p: [0, 1.95, 0.25], grad: 0.2 });
    k.add(new THREE.BoxGeometry(1.64, 0.62, 0.14), paint, { p: [0, 1.55, 0.3] });
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.32, 12), tyre, { r: [0, 0, HALF_PI], p: [sx * 0.86, 0.4, sz * 1.38] });
      k.add(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 8), 0xd8d6e8, { r: [0, 0, HALF_PI], p: [sx * 0.87, 0.4, sz * 1.38] });
    }));
    k.add(new THREE.BoxGeometry(2.0, 0.22, 0.25), 0x3a3850, { p: [0, 0.48, -2.16] });
    k.add(new THREE.BoxGeometry(2.0, 0.22, 0.25), 0x3a3850, { p: [0, 0.48, 2.16] });
    [-1, 1].forEach((s) => {
      k.glow(new THREE.CircleGeometry(0.2, 10), 0xffe7a0, { r: [0, Math.PI, 0], p: [s * 0.6, 0.86, -2.21] });
      k.glow(new THREE.BoxGeometry(0.42, 0.16, 0.05), 0xff2238, { p: [s * 0.62, 0.92, 2.19] });
    });
    if (taxi) {
      k.add(new THREE.BoxGeometry(0.7, 0.26, 0.36), 0x2a2838, { p: [0, 2.12, 0.25] });
      k.glow(new THREE.BoxGeometry(0.62, 0.18, 0.38), 0xffa526, { p: [0, 2.16, 0.25] });
    }
    return finish(k);
  });

  /** A friendly city bus with a row of warm lit windows and a glowing destination sign (~10 m). */
  prop('bus_city', (r) => {
    const k = new Kit(r), paint = pick([0xe8452f, 0x2fa6c8, 0xffb02e, 0x5a7ae8], r, 0.02), cream = 0xfff1d6;
    const L = 10, W = 2.5, y0 = 0.45, H = 2.9;
    k.add(roundBox(W, H, L, 0.18, 14, 10), (cx, cy) => (cy > y0 + H * 0.52 ? cream : paint), { p: [0, y0 + H / 2, 0], jit: 0.015 });
    k.add(new THREE.BoxGeometry(W + 0.04, 0.22, L * 0.9), shade(paint, -0.1), { p: [0, y0 + H * 0.45, 0] });
    // Lit windows down both sides, a dark windscreen and a glowing sign.
    [-1, 1].forEach((s) => k.glow(paneGrid(L * 0.78, 1.0, 6, 1, 0.22, 0.1, (i) => (i === 5 && s > 0 ? 0x2a3050 : 0xffcf6a)), null,
      { m: faceM([s, 0, 0], [0, 1, 0], [s * (W / 2 + 0.02), y0 + H * 0.7, 0.3]) }));
    k.add(new THREE.PlaneGeometry(W * 0.86, 1.1), 0x26305a, { r: [0, Math.PI, 0], p: [0, y0 + H * 0.64, -L / 2 - 0.01] });
    k.glow(new THREE.PlaneGeometry(W * 0.7, 0.3), 0xffa526, { r: [0, Math.PI, 0], p: [0, y0 + H * 0.9, -L / 2 - 0.02] });
    [-1, 1].forEach((s) => {
      k.glow(new THREE.CircleGeometry(0.17, 10), 0xffe7a0, { r: [0, Math.PI, 0], p: [s * 0.85, y0 + 0.55, -L / 2 - 0.02] });
      k.glow(new THREE.BoxGeometry(0.22, 0.4, 0.04), 0xff2238, { p: [s * 0.95, y0 + 0.75, L / 2 + 0.01] });
    });
    [-1, 1].forEach((sx) => [-3.1, 3.1].forEach((z) => {
      k.add(new THREE.CylinderGeometry(0.52, 0.52, 0.36, 12), 0x22202e, { r: [0, 0, HALF_PI], p: [sx * (W / 2 - 0.12), 0.52, z] });
      k.add(new THREE.CylinderGeometry(0.24, 0.24, 0.38, 8), 0xd8d6e8, { r: [0, 0, HALF_PI], p: [sx * (W / 2 - 0.1), 0.52, z] });
    }));
    k.add(new THREE.BoxGeometry(1.6, 0.35, 2.6), 0xd8d6e8, { p: [0, y0 + H + 0.1, 1.2] });
    return finish(k);
  });

  /** A double-headed street lamp, glowing top and bottom so it reads from the rooftops (~6 m). */
  prop('street_light_low', (r) => {
    const k = new Kit(r), post = pick([0x3b3658, 0x2f3a5c], r, 0.02), neon = r.pick(NEONS), H = r.range(5.8, 6.2);
    k.add(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 8), shade(post, -0.04), { p: [0, 0.25, 0] });
    k.add(new THREE.CylinderGeometry(0.09, 0.13, H - 0.5, 7), post, { p: [0, 0.25 + (H - 0.5) / 2, 0], grad: 0.25 });
    k.add(new THREE.BoxGeometry(2.6, 0.14, 0.14), post, { p: [0, H - 0.3, 0] });
    k.glow(new THREE.TorusGeometry(0.15, 0.05, 4, 10), neon, { r: [HALF_PI, 0, 0], p: [0, 2.0, 0] });
    [-1, 1].forEach((s) => {
      const x = s * 1.25;
      k.add(roundBox(0.9, 0.3, 0.55, 0.5, 10, 6), shade(post, 0.1), { p: [x, H - 0.18, 0] });
      k.glow(new THREE.PlaneGeometry(0.7, 0.36), 0xffd979, { r: [HALF_PI, 0, 0], p: [x, H - 0.34, 0] });
      k.glow(new THREE.PlaneGeometry(0.5, 0.2), neon, { r: [-HALF_PI, 0, 0], p: [x, H - 0.02, 0] });
    });
    return finish(k);
  });

  /** A zebra crossing: twelve bars, 12 × 4 m, lying flat at y = 0.02 (origin at its centre). */
  prop('crosswalk', (r) => {
    const k = new Kit(r), n = 12;
    for (let i = 0; i < n; i++) {
      k.add(new THREE.PlaneGeometry(0.58, 4, 1, 2), tone(0xf2f0fa, r, 0.02), { r: [-HALF_PI, 0, 0], p: [(i - (n - 1) / 2) * 1.0, 0.02, 0], jit: 0.02 });
    }
    return finishAt(k);
  });

  /* ── Neon set pieces over the road ───────────────────────────────────── */

  /** A sci-fi neon gateway over the road; the engine hangs a hologram curtain in its opening (~34 × 18 m). */
  prop('holo_gate', (r) => {
    const k = new Kit(r), body = pick([0x2c2a62, 0x30285e], r, 0.02), side = shade(body, 0.1);
    const cols = shuffled([PINK, CYAN, VIOLET], r), c1 = cols[0], c2 = cols[1], c3 = cols[2];
    const IX = 12.75, TOP = 12.35, D = 4.6;
    // The frame: one chunky Π extruded through its depth, a stepped crown on top.
    const outline = [[-17, 0], [-IX, 0], [-IX, TOP], [-11, 13.7], [11, 13.7], [IX, TOP], [IX, 0], [17, 0], [17, 13.2],
      [15.4, 15.8], [4.2, 15.8], [2.6, 17.9], [-2.6, 17.9], [-4.2, 15.8], [-15.4, 15.8], [-17, 13.2]];
    const frameGeo = new THREE.ExtrudeGeometry(polyShape(outline), { depth: D, bevelEnabled: false }).translate(0, 0, -D / 2);
    k.add(frameGeo, (cx, cy, cz) => (Math.abs(cz) > D / 2 - 0.01 ? body : side), { grad: 0.15, jit: 0.02 });
    // Plinths outside the opening.
    [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(5.0, 0.9, D + 1.6), shade(body, -0.05), { p: [s * 15.0, 0.45, 0] }));
    [-1, 1].forEach((fs) => {
      const z = fs * (D / 2 + 0.06);
      // Opening outline and outer outline.
      neonLine(k, [[-IX + 0.02, 0.9, z], [-IX + 0.02, TOP + 0.02, z], [-11, 13.72, z], [11, 13.72, z], [IX - 0.02, TOP + 0.02, z], [IX - 0.02, 0.9, z]], 0.2, c1, false);
      neonLine(k, [[-16.9, 0.9, z], [-16.9, 13.2, z], [-15.35, 15.7, z], [-4.15, 15.7, z], [-2.55, 17.8, z], [2.55, 17.8, z], [4.15, 15.7, z], [15.35, 15.7, z], [16.9, 13.2, z], [16.9, 0.9, z]], 0.2, c2, false);
      // Chevrons up the legs, a diamond in the crown, a row of lights along the beam.
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 4; i++) {
          const y = 2.4 + i * 2.6, x = s * 14.85;
          neonLine(k, [[x - 1.2, y, z], [x, y + 1.0, z], [x + 1.2, y, z]], 0.16, i % 2 ? c3 : c2, false);
        }
      });
      k.glow(slab(polyShape([[0, -1.1], [1.0, 0], [0, 1.1], [-1.0, 0]]), 0.12), 0xffd84a, { p: [0, 16.4, z + fs * 0.04] });
      for (let i = -5; i <= 5; i++) if (i) k.glow(ico(0.28, 0), i % 2 ? c3 : 0xffd84a, { p: [i * 1.8, 14.75, z] });
    });
    // Hologram projectors on the inner walls, facing into the opening.
    [-1, 1].forEach((s) => [2.2, 6.2, 10.2].forEach((y) => [-1.2, 1.2].forEach((z) => {
      k.glow(new THREE.CircleGeometry(0.45, 10), c2, { r: [0, -s * HALF_PI, 0], p: [s * (IX + 0.0) - s * 0.03, y, z] });
    })));
    const out = finishAt(k);
    clearOpening(out, 0.02);
    out.userData.faceRoad = true;
    return out;
  });

  /** A glowing neon hoop arching over the road, with marquee bulbs (~32 × 16 m, 2.4 m deep). */
  prop('neon_hoop', (r) => {
    const k = new Kit(r), cols = shuffled(NEONS, r), c1 = cols[0], c2 = cols[1], c3 = cols[2];
    const HW = 14.2, Y0 = 9.5, RISE = 6.4;
    k.glow(tubeGeo(archPath(HW, Y0, RISE, 4, 24), 0.7, 96, 8), c1);
    k.glow(tubeGeo(archPath(HW - 1.05, Y0, RISE - 1.05, 4, 24), 0.24, 96, 6), c2);
    // Marquee bulbs round the outside of the crown.
    const outer = archPath(HW + 1.0, Y0, RISE + 1.0, 4, 30);
    for (let i = 2; i < outer.length - 2; i += 2) k.glow(ico(0.3, 0), i % 4 ? 0xffd84a : c3, { p: outer[i] });
    // Pedestals at the feet.
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(2.6, 1.3, 2.4), 0x2c2a58, { p: [s * HW, 0.65, 0], jit: 0.02 });
      k.add(new THREE.BoxGeometry(2.9, 0.25, 2.6), 0x3e3a70, { p: [s * HW, 1.4, 0] });
      k.glow(new THREE.BoxGeometry(2.62, 0.18, 2.42), c2, { p: [s * HW, 0.35, 0] });
    });
    const out = finishAt(k);
    clearOpening(out, 0.02);
    return out;
  });

  /* ════════════════════════════════════════════════════════════════════════
   * CLOCKWORK FACTORY — a warm steampunk yard at dusk: brass, copper, warm
   * iron reds, cream and soot grey, glowing windows and molten metal
   * ════════════════════════════════════════════════════════════════════════ */
  const BRASS = [0xe2a83a, 0xd99c30, 0xeab44c];
  const COPPER = [0xd0743a, 0xc8683a, 0xd9844a];
  const IRONRED = [0xa8402e, 0x9c3a2c, 0xb44a34];
  const CREAM = 0xf3e2bf;
  const SOOT = [0x5a545e, 0x4e4854, 0x645e68];
  const IRON = 0x3e3842;
  const BRICK = [0xb24a32, 0xa64430, 0xbe5638];
  const WOOD = [0xc48a50, 0xb47c46, 0xd0985c];
  const LAMP = [0xffa526, 0xffb83a, 0xff9420];
  const VALVE_RED = 0xe0332e;

  /** A pipe along points (CatmullRom) with flange collars at fractions `fl` along it. */
  function pipeRun(k, pts, r, col, flCol, fl, o) {
    o = o || {};
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    k.add(new THREE.TubeGeometry(curve, o.segs || 20, r, o.radial || 8, false), col, { jit: 0.03 }, o.parent);
    (fl || []).forEach((t) => {
      const c = curve.getPointAt(t), d = curve.getTangentAt(t), h = r * 0.42;
      k.add(rod([c.x - d.x * h, c.y - d.y * h, c.z - d.z * h], [c.x + d.x * h, c.y + d.y * h, c.z + d.z * h], r * 1.32, r * 1.32, o.radial || 8), flCol, {}, o.parent);
    });
    return curve;
  }
  /**
   * A meshing gear train: specs [{ n, p: [x, y] } for the first gear, then
   * { n, at: direction (rad) from the previous gear }], all with circular
   * pitch `pitch` and tooth depth `tooth`. Each gear gets its centre, pitch
   * radius rp, tip radius R, a rest angle theta0 that slots its teeth into its
   * neighbour's gaps, and a speed ratio w (the first turns at 1).
   */
  function gearTrain(specs, pitch, tooth) {
    const out = [];
    specs.forEach((sp, i) => {
      const rp = sp.n * pitch / TAU, R = rp + tooth / 2, da = TAU / sp.n;
      if (!i) { out.push({ x: sp.p[0], y: sp.p[1], n: sp.n, rp, R, theta0: sp.theta || 0, w: 1 }); return; }
      const a = out[i - 1], d = a.rp + rp, phi = sp.at;
      const fa = (((phi - a.theta0) / (TAU / a.n)) % 1 + 1) % 1;
      const fb = ((1.06 - fa) % 1 + 1) % 1;
      out.push({ x: a.x + Math.cos(phi) * d, y: a.y + Math.sin(phi) * d, n: sp.n, rp, R, theta0: phi + Math.PI - fb * da, w: -a.w * a.n / sp.n });
    });
    return out;
  }
  /**
   * One gear of a train, built facing Z at depth z on `parent`: a toothed
   * plate, a hub boss and bolt heads. cols = [plate, hub]. o.win spoke windows.
   */
  function gearPart(k, g, z, depth, tooth, cols, parent, o) {
    o = o || {};
    const geo = gearGeo(g.R, g.n, depth, { tooth, hub: o.hole ? g.R * 0.08 : 0, win: o.win === undefined ? (g.n >= 12 ? 5 : 0) : o.win, wIn: g.R * 0.3, wOut: (g.R - tooth) * 0.78 });
    geo.rotateZ(g.theta0);
    const rim = shade(cols[0], 0.08);
    k.add(geo, (cx, cy) => (Math.hypot(cx, cy) > g.R - tooth * 1.1 ? rim : cols[0]), { p: [g.x, g.y, z], jit: 0.03 }, parent);
    const hr = Math.max(0.12, g.R * 0.2);
    k.add(new THREE.CylinderGeometry(hr, hr, depth * 1.7, 10), cols[1], { r: [HALF_PI, 0, 0], p: [g.x, g.y, z] }, parent);
    if (g.R > 0.8) {
      for (let i = 0; i < 4; i++) {
        const a = g.theta0 + i / 4 * TAU + 0.4;
        k.add(new THREE.CylinderGeometry(hr * 0.16, hr * 0.16, depth * 1.9, 5), shade(cols[1], 0.2), { r: [HALF_PI, 0, 0], p: [g.x + Math.cos(a) * hr * 0.62, g.y + Math.sin(a) * hr * 0.62, z] }, parent);
      }
    }
  }
  /** Spin the gears of a train (each its own group of a rig) about Z through their centres. */
  function gearRig(k, train, nodes, speed, extra) {
    return rig(k, nodes, k.mat, (g, t, M) => {
      if (g < train.length) aboutAxis(M, [train[g].x, train[g].y, 0], 0, 0, 1, train[g].w * speed * t);
      else if (extra) extra(g, t, M);
    }, 2);
  }

  /* ── Factory near ───────────────────────────────────────────────────── */

  /** A bundle of curving copper, brass and red pipes with flanges, a valve, a gauge and a puff of steam (~4 m). */
  prop('pipe_stack', (r) => {
    const k = new Kit(r), cA = pick(COPPER, r), cB = pick(BRASS, r), cC = pick(IRONRED, r), fl = pick(BRASS, r, 0.02);
    k.add(new THREE.BoxGeometry(3.3, 0.3, 2.3), pick(SOOT, r), { p: [0.25, 0.15, 0.1], jit: 0.03 });
    pipeRun(k, [[-1.0, 0.1, -0.45], [-1.0, 2.2, -0.45], [-0.85, 3.05, -0.45], [-0.3, 3.42, -0.45], [0.3, 3.42, -0.45], [0.85, 3.05, -0.45], [1.0, 2.2, -0.45], [1.0, 0.1, -0.45]],
      0.26, cA, fl, [0.1, 0.5, 0.9], { segs: 24, radial: 7 });
    pipeRun(k, [[-0.4, 0.1, 0.78], [-0.4, 1.6, 0.78], [-0.2, 2.1, 0.78], [0.5, 2.22, 0.78], [1.25, 2.1, 0.78], [1.5, 1.6, 0.78], [1.5, 0.1, 0.78]],
      0.2, cB, fl, [0.22, 0.78], { segs: 18, radial: 7 });
    // A tall red stack with flanges, a mushroom vent and a gauge.
    k.add(new THREE.CylinderGeometry(0.31, 0.33, 3.7, 9), cC, { p: [0.05, 2.0, 0.2], jit: 0.03 });
    [1.2, 2.9].forEach((y) => k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 9), fl, { p: [0.05, y, 0.2] }));
    k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), cC, { p: [0.05, 4.0, 0.2] });
    k.add(new THREE.ConeGeometry(0.52, 0.34, 9), fl, { p: [0.05, 4.32, 0.2] });
    k.add(rod([0.05, 2.35, -0.05], [0.05, 2.35, -0.3], 0.05, 0.05, 5), IRON);
    k.add(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12), fl, { r: [HALF_PI, 0, 0], p: [0.05, 2.35, -0.33] });
    k.add(new THREE.CircleGeometry(0.22, 12), CREAM, { r: [0, Math.PI, 0], p: [0.05, 2.35, -0.385] });
    k.add(new THREE.BoxGeometry(0.03, 0.17, 0.01), VALVE_RED, { r: [0, 0, -0.7], p: [0.1, 2.39, -0.39] });
    // A red handwheel on the big U.
    k.add(rod([0, 3.66, -0.45], [0, 3.92, -0.45], 0.05, 0.05, 5), IRON);
    k.add(new THREE.TorusGeometry(0.3, 0.05, 4, 12), VALVE_RED, { r: [HALF_PI, 0, 0], p: [0, 3.94, -0.45] });
    k.add(new THREE.BoxGeometry(0.6, 0.04, 0.05), VALVE_RED, { p: [0, 3.94, -0.45] });
    k.add(new THREE.BoxGeometry(0.05, 0.04, 0.6), VALVE_RED, { p: [0, 3.94, -0.45] });
    // A little steam puff from the vent.
    puff(k, 0.1, 4.75, 0.2, 0.3, 0.85, [0xfff8ec, 0xe6d6c4], 7);
    puff(k, 0.32, 5.1, 0.25, 0.22, 0.85, [0xfff8ec, 0xe6d6c4], 6);
    return finish(k);
  });

  /** A planked wooden crate with a frame and a diagonal brace (node-centred, bottom at y = 0). */
  function crate(k, s, wood, parent, o) {
    o = o || {};
    const light = shade(wood, 0.07), dark = shade(wood, -0.16), e = s / 2, t = s * 0.12;
    k.add(new THREE.BoxGeometry(s - 0.02, s - 0.02, s - 0.02, 1, 4, 1), (cx, cy) => (Math.floor(cy / s * 4 + 8) % 2 ? wood : light), { p: [0, e, 0], jit: 0.04 }, parent);
    const q = e - t / 2 + 0.015;
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => {
      k.add(new THREE.BoxGeometry(s + 0.03, t, t), dark, { p: [0, e + a * q, b * q] }, parent);
      k.add(new THREE.BoxGeometry(t, s, t), dark, { p: [a * q, e, b * q] }, parent);
      k.add(new THREE.BoxGeometry(t, t, s - 2 * t + 0.03), dark, { p: [a * q, e + b * q, 0] }, parent);
    }));
    [-1, 1].forEach((b) => k.add(bar([-q + t * 0.4, t * 1.2, b * (e + 0.01)], [q - t * 0.4, s - t * 1.2, b * (e + 0.01)], t * 0.85, t * 0.4), dark, {}, parent));
    if (o.corners) {
      [-1, 1].forEach((a) => [-1, 1].forEach((b) => [0, 1].forEach((c) =>
        k.add(new THREE.BoxGeometry(t * 1.5, t * 1.5, t * 1.5), o.corners, { p: [a * (e - t * 0.55), c ? s - t * 0.55 : t * 0.55, b * (e - t * 0.55)] }, parent))));
    }
  }

  /** A stack of wooden crates: two on the floor, one on top, a little box on that, one aside (~3 m). */
  prop('crate_stack', (r) => {
    const k = new Kit(r), spots = [[-0.7, 0, 0, 1.3, r.range(-0.08, 0.08)], [0.68, 0, r.range(-0.15, 0.15), 1.3, r.range(-0.1, 0.1)],
      [r.range(-0.15, 0.15), 1.3, r.range(-0.1, 0.1), 1.12, r.range(0.2, 0.45)], [r.range(-0.2, 0.2), 2.42, 0, 0.55, r.range(0, 1)],
      [r.range(1.9, 2.1), 0, r.range(-0.8, 0.2), 0.85, r.range(0, 1)]];
    spots.forEach(([x, y, z, s, yaw]) => {
      const node = new THREE.Group();
      crate(k, s, pick(WOOD, r, 0.03), node);
      node.position.set(x, y, z);
      node.rotation.y = yaw;
      k.root.add(node);
    });
    return finish(k);
  });

  /** A steel drum with a painted band, ribs, a rim and a bung (node-centred, standing on y = 0). */
  function drum(k, col, band, parent) {
    const R = 0.42, H = 1.25;
    k.add(new THREE.CylinderGeometry(R, R, H, 12, 3), (cx, cy) => (Math.abs(cy - H / 2) < H * 0.17 ? band : col), { p: [0, H / 2, 0], jit: 0.03 }, parent);
    [0.27, 0.73].forEach((f) => k.add(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.07, 12, 1, true), shade(col, -0.12), { p: [0, H * f, 0] }, parent));
    k.add(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.08, 12, 1, true), shade(col, -0.1), { p: [0, H - 0.03, 0] }, parent);
    k.add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 6), 0x2a2830, { p: [R * 0.5, H + 0.02, 0.05] }, parent);
  }
  /** Three standing oil drums and one lying across two of them (~2 m). */
  prop('barrel_group', (r) => {
    const k = new Kit(r), ways = shuffled([[0xd2382e, CREAM], [0xf0b42a, 0x3a3238], [0x2f8a9a, CREAM], [0x3a64c0, 0xf0c040]], r);
    const spots = [[-0.5, 0, 0.0], [0.47, 0, -0.25], [0.12, 0, 0.66]];
    spots.forEach(([x, y, z], i) => {
      const node = new THREE.Group();
      drum(k, tone(ways[i][0], r, 0.02), ways[i][1], node);
      node.position.set(x, y, z);
      node.rotation.y = r.range(0, TAU);
      k.root.add(node);
    });
    const top = new THREE.Group();
    drum(k, tone(ways[3][0], r, 0.02), ways[3][1], top);
    top.children.forEach((m) => m.geometry.translate(0, -0.625, 0).rotateZ(HALF_PI));
    top.position.set(-0.02, 1.25 + 0.42, -0.12);
    top.rotation.y = -0.25;
    k.root.add(top);
    return finish(k);
  });

  /** An iron post carrying three meshing gears that turn together (~4 m). */
  prop('gear_post', (r) => {
    const k = new Kit(r), post = pick(SOOT, r, 0.02), fl = pick(BRASS, r, 0.02);
    k.add(new THREE.BoxGeometry(0.95, 0.4, 0.95), shade(post, -0.05), { p: [0, 0.2, 0], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(0.17, 0.24, 2.9, 8), post, { p: [0, 1.85, 0.05], grad: 0.15 });
    [0.6, 2.2].forEach((y) => k.add(new THREE.CylinderGeometry(0.25, 0.25, 0.14, 8), fl, { p: [0, y, 0.05] }));
    k.add(new THREE.BoxGeometry(0.5, 0.5, 0.36), post, { p: [0, 3.0, 0.05] });
    const train = gearTrain([{ n: 15, p: [0, 3.0], theta: r.range(0, 1) }, { n: 8, at: -0.55 }], 0.42, 0.17);
    // A third gear meshing with the big one on its other side.
    const gears = train.concat([gearTrain([{ n: 15, p: [0, 3.0], theta: train[0].theta0 }, { n: 10, at: Math.PI + 0.62 }], 0.42, 0.17)[1]]);
    const cols = [[pick(BRASS, r, 0.02), IRON], [pick(COPPER, r, 0.02), fl], [pick(IRONRED, r, 0.02), fl]];
    // Arms out to the small gears' axles.
    gears.slice(1).forEach((g) => k.add(bar([0, 3.0, 0.12], [g.x, g.y, 0.12], 0.16, 0.14), post));
    const nodes = gears.map((g, i) => { const n = new THREE.Group(); gearPart(k, g, -0.32, 0.2, 0.17, cols[i], n); return n; });
    gearRig(k, gears, nodes, 0.7 * r.sign());
    return finish(k);
  });

  /** A caged industrial lamp hanging from a curly bracket on an iron post (~5 m). */
  prop('lamp_cage', (r) => {
    const k = new Kit(r), post = pick(SOOT, r, 0.02), fl = pick(BRASS, r, 0.02), H = r.range(4.6, 4.9);
    k.add(new THREE.CylinderGeometry(0.34, 0.42, 0.4, 8), shade(post, -0.05), { p: [0, 0.2, 0] });
    k.add(new THREE.CylinderGeometry(0.1, 0.15, H, 8), post, { p: [0, 0.4 + H / 2, 0], grad: 0.15 });
    [0.55, 1.6].forEach((y) => k.add(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), fl, { p: [0, y, 0] }));
    k.add(ico(0.16, 1), fl, { p: [0, H + 0.45, 0] });
    // Bracket: a scrolled arm out to the lamp.
    k.add(tubeGeo([[0, H - 0.5, 0], [-0.3, H - 0.05, 0], [-0.8, H + 0.1, 0], [-1.25, H - 0.1, 0]], 0.06, 12, 5), post);
    k.add(tubeGeo([[0, H - 1.0, 0], [-0.25, H - 0.75, 0], [-0.45, H - 0.45, 0], [-0.35, H - 0.3, 0]], 0.04, 8, 4), fl);
    const lx = -1.25, ty = H - 0.25;
    k.add(rod([lx, H - 0.1, 0], [lx, ty, 0], 0.03, 0.03, 4), IRON);
    // Hood, bulb, cage bars and a bottom cup.
    k.add(new THREE.ConeGeometry(0.5, 0.32, 12, 1, true), fl, { p: [lx, ty - 0.16, 0] });
    k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), fl, { p: [lx, ty - 0.02, 0] });
    k.glow(new THREE.SphereGeometry(0.27, 10, 7), LAMP[0], { s: [1, 1.2, 1], p: [lx, ty - 0.66, 0] });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      k.add(tubeGeo([[lx + Math.cos(a) * 0.4, ty - 0.3, Math.sin(a) * 0.4], [lx + Math.cos(a) * 0.4, ty - 0.68, Math.sin(a) * 0.4], [lx + Math.cos(a) * 0.12, ty - 1.08, Math.sin(a) * 0.12]], 0.022, 5, 3), IRON);
    }
    k.add(new THREE.TorusGeometry(0.4, 0.03, 3, 12), IRON, { r: [HALF_PI, 0, 0], p: [lx, ty - 0.55, 0] });
    k.add(new THREE.SphereGeometry(0.14, 8, 4, 0, TAU, HALF_PI, HALF_PI), fl, { p: [lx, ty - 1.04, 0] });
    return finish(k);
  });

  /** A big red handwheel on a valve in a bent pipe (~2.5 m). */
  prop('valve_wheel', (r) => {
    const k = new Kit(r), col = pick(r.chance(0.5) ? COPPER : IRONRED, r), fl = pick(BRASS, r, 0.02);
    k.add(new THREE.BoxGeometry(2.3, 0.22, 1.0), pick(SOOT, r), { p: [0, 0.11, 0.1], jit: 0.03 });
    pipeRun(k, [[-0.8, 0.1, 0.1], [-0.8, 1.6, 0.1], [-0.68, 2.08, 0.1], [-0.2, 2.25, 0.1], [0.3, 2.22, 0.1], [0.72, 2.0, 0.1], [0.82, 1.5, 0.1], [0.82, 0.1, 0.1]],
      0.22, col, fl, [0.1, 0.62, 0.92], { segs: 22, radial: 8 });
    // The valve body on the left leg, its stem toward the viewer, and the big wheel.
    k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 10), fl, { p: [-0.8, 1.15, 0.1] });
    k.add(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 10), fl, { r: [HALF_PI, 0, 0], p: [-0.8, 1.15, -0.25] });
    k.add(rod([-0.8, 1.15, -0.4], [-0.8, 1.15, -0.72], 0.05, 0.05, 6), IRON);
    const wz = -0.72, wy = 1.15, R = 0.66;
    k.add(new THREE.TorusGeometry(R, 0.075, 6, 20), VALVE_RED, { p: [-0.8, wy, wz] });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + HALF_PI;
      k.add(bar([-0.8, wy, wz], [-0.8 + Math.cos(a) * R, wy + Math.sin(a) * R, wz], 0.07, 0.05), VALVE_RED);
      k.add(ico(0.09, 0), shade(VALVE_RED, 0.1), { p: [-0.8 + Math.cos(a) * R * 1.12, wy + Math.sin(a) * R * 1.12, wz] });
    }
    k.add(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 8), fl, { r: [HALF_PI, 0, 0], p: [-0.8, wy, wz - 0.02] });
    // A gauge on the other leg.
    k.add(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 12), fl, { r: [HALF_PI, 0, 0], p: [0.82, 1.35, -0.18] });
    k.add(new THREE.CircleGeometry(0.18, 12), CREAM, { r: [0, Math.PI, 0], p: [0.82, 1.35, -0.23] });
    k.add(new THREE.BoxGeometry(0.03, 0.14, 0.01), VALVE_RED, { r: [0, 0, 0.6], p: [0.79, 1.38, -0.235] });
    return finish(k);
  });

  /* ── Factory far ────────────────────────────────────────────────────── */

  /** A tall brick chimney with cream bands, a sooty crown and soft smoke drifting off it (~50 m). */
  prop('smokestack', (r) => {
    const k = new Kit(r), H = r.range(46, 51), seed = r.next() * 99;
    const brick = pick(BRICK, r, 0.02), b2 = shade(brick, -0.07), b3 = shade(brick, 0.05);
    k.add(new THREE.BoxGeometry(7.5, 5, 7.5, 1, 4, 1), (cx, cy) => (Math.floor(cy * 0.8 + 8) % 2 ? brick : b2), { p: [0, 2.5, 0], jit: 0.04 });
    k.add(new THREE.BoxGeometry(8.1, 0.6, 8.1), CREAM, { p: [0, 5.1, 0] });
    const door = new THREE.Shape();
    door.moveTo(-1.1, 0); door.lineTo(1.1, 0); door.lineTo(1.1, 1.8); door.absarc(0, 1.8, 1.1, 0, Math.PI, false); door.lineTo(-1.1, 0);
    k.glow(slab(door, 0.06, 6).rotateY(Math.PI), 0xff8a1a, { p: [0, 0.3, -3.78] });
    k.add(new THREE.BoxGeometry(2.8, 0.25, 0.3), CREAM, { p: [0, 0.2, -3.8] });
    const y0 = 5.4, h = H - y0 - 2.2, rows = 22;
    k.add(new THREE.CylinderGeometry(1.75, 2.6, h, 12, rows, true), (cx, cy, cz) => {
      const row = Math.floor((cy - y0) / h * rows);
      if (row === 7 || row === 14 || row === 19) return CREAM;
      const v = hash3(Math.round(Math.atan2(cz, cx) * 4), row, 0, seed);
      return v > 0.45 ? b2 : v < -0.55 ? b3 : brick;
    }, { p: [0, y0 + h / 2, 0], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(2.25, 1.8, 1.6, 12), shade(brick, -0.12), { p: [0, H - 1.4, 0] });
    k.add(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 12), 0x3a3238, { p: [0, H - 0.3, 0] });
    k.add(new THREE.CircleGeometry(1.7, 12), 0x1e1a20, { r: [-HALF_PI, 0, 0], p: [0, H + 0.01, 0] });
    // Soft smoke drifting off downwind, slowly swinging round.
    const node = new THREE.Group(), smoke = [0xefe8e2, 0xbdb3b8];
    [[0, 1.6, 0, 2.0], [1.4, 3.6, 0.3, 2.5], [3.6, 5.3, 0.7, 2.9], [6.4, 6.4, 1.0, 3.1], [9.3, 7.0, 1.2, 2.7]].forEach(([x, y, z, R], i) =>
      puff(k, x, H + y, z, R * r.range(0.9, 1.1), 0.8, smoke, 9 - (i > 2 ? 1 : 0), node));
    const sm = keep(node);
    k.root.add(sm);
    sway(k, sm, 'y', 0.12, 0.5, r.range(0, TAU));
    return finish(k);
  });

  /** A brick factory hall with a sawtooth roof of glowing glazing, tall lit windows and a gear badge (~40 m; faces the road). */
  prop('factory_hall', (r) => {
    const k = new Kit(r), brick = pick(BRICK, r, 0.02), b2 = shade(brick, -0.08), roof = pick(SOOT, r, 0.02), fl = pick(BRASS, r, 0.02);
    const teeth = 5, tw = 8, W = teeth * tw, D = r.range(20, 23), H = 12, TH = 6;
    k.add(new THREE.BoxGeometry(W, H, D, 5, 6, 3), (cx, cy) => (Math.floor(cy / H * 12) % 3 === 0 ? b2 : brick), { p: [0, H / 2, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(W + 0.6, 0.8, D + 0.6), CREAM, { p: [0, H, 0] });
    k.add(new THREE.BoxGeometry(W + 0.4, 0.9, D + 0.4), shade(brick, -0.16), { p: [0, 0.45, 0] });
    for (let i = 0; i <= teeth; i++) k.add(new THREE.BoxGeometry(0.9, H - 1.2, 0.5), b2, { p: [-W / 2 + i * tw, H / 2, -D / 2 - 0.2] });
    // Sawtooth roof: glazing faces toward -X, sloped roofs toward +X.
    for (let i = 0; i < teeth; i++) {
      const x0 = -W / 2 + i * tw;
      const tooth = new THREE.ExtrudeGeometry(polyShape([[0, 0], [tw, 0], [0, TH]]), { depth: D, bevelEnabled: false }).translate(x0, H + 0.4, -D / 2);
      k.add(tooth, (cx, cy, cz) => (Math.abs(cz) > D / 2 - 0.01 ? brick : roof), { jit: 0.03 });
      k.glow(paneGrid(D - 1.4, TH - 1.6, Math.round((D - 1.4) / 2.6), 2, 0.35, 0.3, () => r.pick(LAMP)), null,
        { m: faceM([-1, 0, 0], [0, 1, 0], [x0 - 0.04, H + 0.4 + TH * 0.45, 0]) });
    }
    // Tall arched windows in the front bays, a big door in the middle one.
    const arch = new THREE.Shape();
    arch.moveTo(-0.95, 0); arch.lineTo(0.95, 0); arch.lineTo(0.95, 3.6); arch.absarc(0, 3.6, 0.95, 0, Math.PI, false); arch.lineTo(-0.95, 0);
    for (let i = 0; i < teeth; i++) {
      const cx = -W / 2 + (i + 0.5) * tw, fz = -D / 2 - 0.05;
      if (i === 2) {
        k.add(new THREE.BoxGeometry(5.4, 7.2, 0.3), CREAM, { p: [cx, 3.6, fz - 0.05] });
        k.add(new THREE.BoxGeometry(4.6, 6.6, 0.2), 0x4a3a34, { p: [cx, 3.3, fz - 0.15] });
        for (let j = 0; j < 4; j++) k.add(new THREE.BoxGeometry(4.6, 0.12, 0.08), 0x2e2622, { p: [cx, 1.0 + j * 1.6, fz - 0.27] });
        k.glow(new THREE.PlaneGeometry(4.4, 0.7), LAMP[1], { r: [0, Math.PI, 0], p: [cx, 7.75, fz - 0.03] });
        k.add(gearGeo(1.4, 12, 0.25, { tooth: 0.3, hub: 0.45 }), fl, { p: [cx, 10.0, fz - 0.2] });
      } else {
        [-1.6, 1.6].forEach((dx) => {
          k.add(new THREE.BoxGeometry(2.3, 0.25, 0.35), CREAM, { p: [cx + dx, 2.35, fz - 0.1] });
          k.glow(slab(arch, 0.06, 6).rotateY(Math.PI), r.pick(LAMP), { p: [cx + dx, 2.5, fz - 0.02] });
        });
      }
    }
    boxWindows(k, 0, 0, W, D, 2.4, 6.4, { floor: 3.2, col: 3.4, gx: 1.4, gy: 0.9, sides: [1, 2, 3], fn: () => (r.chance(0.85) ? r.pick(LAMP) : 0x3a2a24) });
    // Two brick chimneys up through the roof.
    [[-W / 2 + tw * 1.55, D * 0.18], [W / 2 - tw * 0.45, -D * 0.2]].forEach(([x, z]) => {
      k.add(new THREE.CylinderGeometry(0.9, 1.1, 14, 8), brick, { p: [x, H + 7, z], jit: 0.04 });
      k.add(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 8), 0x3a3238, { p: [x, H + 14.2, z] });
    });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A round gas-holder tank in a lattice frame of columns, rings and X-bracing, with lamps on top (~30 m). */
  prop('gasometer', (r) => {
    const k = new Kit(r), tank = pick([0x5f9a8c, 0x8a9a6a, 0xb8644a], r, 0.03), frame = pick([CREAM, 0xb44a34], r, 0.02), fl = pick(BRASS, r, 0.02);
    const RT = 11, HT = 21, RF = 12.6, HF = 28, N = 10;
    k.add(new THREE.CylinderGeometry(RT, RT, HT, 24, 7, true), (cx, cy) => (Math.floor(cy / HT * 7 + 0.5) % 2 ? tank : shade(tank, -0.06)), { p: [0, HT / 2, 0], jit: 0.02 });
    const RS = RT / Math.sin(0.5);
    k.add(new THREE.SphereGeometry(RS, 24, 4, 0, TAU, 0, 0.5), shade(tank, 0.08), { p: [0, HT - RS * Math.cos(0.5), 0], grad: 0.15 });
    k.add(new THREE.CylinderGeometry(RT + 0.3, RT + 0.3, 0.7, 24, 1, true), shade(tank, -0.15), { p: [0, HT - 0.2, 0] });
    k.add(new THREE.CylinderGeometry(RT + 1.6, RT + 1.9, 1.2, 24), pick(SOOT, r), { p: [0, 0.6, 0] });
    const col = (i) => { const a = i / N * TAU; return [Math.cos(a) * RF, Math.sin(a) * RF]; };
    const levels = [1.2, 10, 19, HF];
    for (let i = 0; i < N; i++) {
      const [x, z] = col(i), [x2, z2] = col(i + 1);
      k.add(bar([x, 1.2, z], [x, HF + 1.0, z], 0.65), frame);
      k.add(ico(0.55, 0), fl, { p: [x, HF + 1.3, z] });
      for (let l = 1; l < levels.length; l++) {
        k.add(bar([x, levels[l], z], [x2, levels[l], z2], 0.45), frame);
        const lo = levels[l - 1], hi = levels[l];
        k.add(bar([x, lo, z], [x2, hi, z2], 0.18), shade(frame, -0.15));
        k.add(bar([x2, lo, z2], [x, hi, z], 0.18), shade(frame, -0.15));
      }
      if (i % 2 === 0) k.glow(ico(0.45, 1), LAMP[1], { p: [x * 1.02, HF + 0.6, z * 1.02] });
    }
    return finish(k);
  });

  /** A yellow lattice tower crane whose jib slowly swings to and fro, a hook and a crate hanging from it (~40 m). */
  prop('crane_tower', (r) => {
    const k = new Kit(r), yel = pick([0xf0a81f, 0xf2b83a, 0xe89a24], r, 0.02), dark = shade(yel, -0.2), red = 0xc8402e;
    const M = 34, s = 1.2, panels = 11, ph = M / panels;
    k.add(new THREE.BoxGeometry(5.5, 1.2, 5.5), pick(SOOT, r), { p: [0, 0.6, 0] });
    const corners = [[-s, -s], [s, -s], [s, s], [-s, s]];
    corners.forEach(([x, z]) => k.add(bar([x, 1.2, z], [x, M, z], 0.32), yel));
    for (let p = 0; p < panels; p++) {
      const y0 = 1.2 + p * (M - 1.2) / panels, y1 = y0 + (M - 1.2) / panels;
      for (let c = 0; c < 4; c++) {
        const a = corners[c], b = corners[(c + 1) % 4];
        k.add(bar([a[0], y1, a[1]], [b[0], y1, b[1]], 0.16), dark);
        const flip = (p + c) % 2;
        k.add(bar([flip ? a[0] : b[0], y0, flip ? a[1] : b[1]], [flip ? b[0] : a[0], y1, flip ? b[1] : a[1]], 0.14), dark);
      }
    }
    // The slewing top: cab, jib, counter-jib, peak, ties, trolley, hook and a hanging crate.
    const top = new THREE.Group(), J = 26, CJ = 9, jy = M + 0.6;
    k.add(new THREE.BoxGeometry(3.2, 1.0, 3.2), yel, { p: [0, M + 0.5, 0] }, top);
    k.add(new THREE.BoxGeometry(2.0, 2.0, 2.0), yel, { p: [1.0, M - 0.6, -2.3] }, top);
    k.glow(new THREE.PlaneGeometry(1.6, 1.0), LAMP[1], { r: [0, Math.PI, 0], p: [1.0, M - 0.4, -3.31] }, top);
    const jibTri = [[0, 0.9, -0.75], [0, 0.9, 0.75], [0, -0.4, 0]];
    jibTri.forEach(([, dy, dz]) => k.add(bar([0, jy + dy + 0.4, dz], [J, jy + dy + 0.4, dz], 0.18), yel, {}, top));
    for (let i = 0; i < 12; i++) {
      const x0 = i * J / 12, x1 = (i + 1) * J / 12;
      [-0.75, 0.75].forEach((dz) => k.add(bar([x0, jy + 1.3, dz], [x1, jy, 0], 0.1), dark, {}, top));
    }
    k.add(new THREE.BoxGeometry(CJ, 0.5, 1.8), yel, { p: [-CJ / 2, jy + 0.6, 0] }, top);
    k.add(new THREE.BoxGeometry(2.6, 2.4, 2.2), 0x8a8a8a, { p: [-CJ + 1.5, jy - 0.6, 0], jit: 0.03 }, top);
    k.add(new THREE.BoxGeometry(2.6, 0.5, 2.25), red, { p: [-CJ + 1.5, jy + 0.25, 0] }, top);
    [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]].forEach(([x, z]) => k.add(bar([x, jy + 0.9, z], [0, jy + 6.2, 0], 0.2), yel, {}, top));
    k.add(ico(0.35, 0), red, { p: [0, jy + 6.3, 0] }, top);
    k.add(rod([0, jy + 6.2, 0], [J * 0.62, jy + 1.3, 0], 0.06, 0.06, 4), 0x3a3238, {}, top);
    k.add(rod([0, jy + 6.2, 0], [-CJ + 0.6, jy + 0.85, 0], 0.06, 0.06, 4), 0x3a3238, {}, top);
    const tx = J * r.range(0.55, 0.8), hy = jy - r.range(12, 16);
    k.add(new THREE.BoxGeometry(1.2, 0.5, 1.2), dark, { p: [tx, jy - 0.55, 0] }, top);
    k.add(rod([tx, jy - 0.8, 0], [tx, hy + 0.6, 0], 0.05, 0.05, 4), 0x3a3238, {}, top);
    k.add(new THREE.BoxGeometry(0.7, 0.9, 0.5), red, { p: [tx, hy + 0.3, 0] }, top);
    k.add(new THREE.TorusGeometry(0.35, 0.09, 4, 10, Math.PI * 1.4), 0x3a3238, { r: [0, 0, -0.4], p: [tx, hy - 0.4, 0] }, top);
    const cs = new THREE.Group();
    crate(k, 1.8, pick(WOOD, r, 0.02), cs);
    cs.position.set(tx, hy - 2.9, 0);
    top.add(cs);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => k.add(rod([tx, hy - 0.7, 0], [tx + sx * 0.8, hy - 1.1, sz * 0.8], 0.03, 0.03, 3), 0x3a3238, {}, top)));
    const slew = keep(top);
    slew.rotation.y = r.range(0, TAU);
    k.root.add(slew);
    sway(k, slew, 'y', 0.13, 0.55, r.range(0, TAU));
    return finish(k);
  });

  /* ── Factory landmarks ──────────────────────────────────────────────── */

  /** An arched window outline w wide, its springing line h up, standing on y = 0. */
  function archWin(w, h) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.absarc(0, h, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0);
    return s;
  }

  /**
   * A giant brick clock tower: four glowing clock faces whose hands really
   * turn, two meshing gears turning on the front of the shaft, and a
   * verdigris roof with a lit lantern and a gear weathervane (~64 m; faces the road).
   */
  prop('clock_tower', (r) => {
    const k = new Kit(r), brick = pick(BRICK, r, 0.02), b2 = shade(brick, -0.09), stone = pick(SOOT, r, 0.02);
    const fl = pick(BRASS, r, 0.02), roof = pick([0x3f9a8a, 0x4aa08e, 0xc8683a], r, 0.02), dark = 0x2a2430;
    const S = 11, Y0 = 4, Y1 = 32, C0 = 32.6, C1 = 44.6, CY = 38.6, CD = 6.5, FR = 4.8;
    const FACES = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
    const onFace = (n, d) => faceM(n, [0, 1, 0], [n[0] * d, 0, n[2] * d]);
    // Stone plinth, brick shaft with cream string courses, corner pilasters, lamps on the plinth.
    k.add(new THREE.BoxGeometry(15, Y0, 15), stone, { p: [0, Y0 / 2, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(15.6, 0.6, 15.6), CREAM, { p: [0, Y0, 0] });
    const rows = 14;
    k.add(new THREE.BoxGeometry(S, Y1 - Y0, S, 1, rows, 1), (cx, cy) => (Math.floor((cy - Y0) / (Y1 - Y0) * rows) % 3 === 2 ? b2 : brick),
      { p: [0, (Y0 + Y1) / 2, 0], jit: 0.03 });
    [15.4, 24.4].forEach((y) => k.add(new THREE.BoxGeometry(S + 0.5, 0.5, S + 0.5), CREAM, { p: [0, y, 0] }));
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      k.add(new THREE.BoxGeometry(1.5, Y1 - Y0, 1.5), b2, { p: [sx * (S / 2 - 0.3), (Y0 + Y1) / 2, sz * (S / 2 - 0.3)], jit: 0.03 });
      k.add(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6), fl, { p: [sx * 6.9, Y0 + 1.1, sz * 6.9] });
      k.glow(ico(0.5, 1), LAMP[0], { p: [sx * 6.9, Y0 + 2.2, sz * 6.9] });
    }));
    // Arched windows: the front has a door and two pairs with the gears between; the other sides three pairs.
    FACES.forEach((n, f) => {
      (f === 0 ? [10.2, 26.6] : [9.6, 17.6, 26.6]).forEach((y) => [-1.6, 1.6].forEach((x) => {
        k.add(new THREE.BoxGeometry(2.3, 0.3, 0.4).translate(x, y - 0.15, 0), CREAM, { m: onFace(n, S / 2 + 0.1) });
        k.glow(slab(archWin(1.6, 2.4), 0.08, 6).translate(x, y, 0), r.pick(LAMP), { m: onFace(n, S / 2 + 0.02) });
      }));
    });
    k.add(new THREE.BoxGeometry(4.0, 5.4, 0.5).translate(0, Y0 + 2.7, 0), CREAM, { m: onFace(FACES[0], S / 2 + 0.05) });
    k.glow(slab(archWin(3.0, 3.4), 0.08, 8).translate(0, Y0 + 0.05, 0), 0xff8a1a, { m: onFace(FACES[0], S / 2 + 0.32) });
    // Clock stage: cornices, pilasters and four pinnacles.
    k.add(new THREE.BoxGeometry(14.6, 1.0, 14.6), CREAM, { p: [0, C0, 0] });
    k.add(new THREE.BoxGeometry(13, C1 - C0, 13, 1, 4, 1), brick, { p: [0, (C0 + C1) / 2, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(15, 1.2, 15), CREAM, { p: [0, C1, 0] });
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      k.add(new THREE.BoxGeometry(1.7, C1 - C0, 1.7), b2, { p: [sx * 6.3, (C0 + C1) / 2, sz * 6.3] });
      k.add(new THREE.ConeGeometry(0.6, 2.8, 6), roof, { p: [sx * 6.9, C1 + 2.0, sz * 6.9] });
      k.add(ico(0.3, 0), fl, { p: [sx * 6.9, C1 + 3.5, sz * 6.9] });
    }));
    // Clock faces: brass bezel, glowing dial, hour marks, a boss; the hands go into the rig.
    const tH = r.range(0, 12), hand0 = [tH / 12 * TAU, (tH % 1) * TAU];
    const hands = [];
    FACES.forEach((n) => {
      const M = onFace(n, CD);
      k.add(new THREE.CylinderGeometry(FR + 0.5, FR + 0.6, 0.5, 28).rotateX(HALF_PI).translate(0, CY, 0.2), fl, { m: M });
      k.glow(new THREE.CircleGeometry(FR, 28).translate(0, CY, 0.47), 0xffc45a, { m: M });
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU, big = i % 3 === 0;
        k.add(new THREE.BoxGeometry(big ? 0.5 : 0.26, big ? 1.1 : 0.6, 0.06).rotateZ(-a).translate(Math.sin(a) * (FR - 0.75), CY + Math.cos(a) * (FR - 0.75), 0.5), dark, { m: M });
      }
      k.add(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 10).rotateX(HALF_PI).translate(0, CY, 0.8), fl, { m: M });
      [[0.3, 2.8, 0.58], [0.2, 4.0, 0.7]].forEach(([w, L, z], h) => {
        const g = new THREE.Group();
        k.add(slab(polyShape([[-w, -0.7], [w, -0.7], [w, L - 0.6], [0, L], [-w, L - 0.6]]), 0.1).translate(0, CY, z), dark, { m: M }, g);
        hands.push({ g, n, h });
      });
    });
    // Two meshing gears on the front of the shaft, on stub axles.
    const train = gearTrain([{ n: 14, p: [0, 19.9], theta: r.range(0, 1) }, { n: 8, at: -2.0 }], 1.35, 0.6);
    const gearNodes = train.map((g, i) => {
      const nd = new THREE.Group();
      gearPart(k, g, -6.3, 0.4, 0.6, i ? [pick(COPPER, r, 0.02), fl] : [fl, IRON], nd);
      k.add(rod([g.x, g.y, -6.1], [g.x, g.y, -5.45], 0.22, 0.22, 6), IRON);
      return nd;
    });
    const W = [0.025, 0.3];
    rig(k, gearNodes.concat(hands.map((h) => h.g)), k.mat, (g, t, M) => {
      if (g < train.length) { aboutAxis(M, [train[g].x, train[g].y, 0], 0, 0, 1, train[g].w * 0.4 * t); return; }
      const hd = hands[g - train.length], n = hd.n;
      // Clockwise as seen from outside: negative about the outward normal.
      aboutAxis(M, [n[0] * CD, CY, n[2] * CD], n[0], n[1], n[2], -(hand0[hd.h] + W[hd.h] * t));
    }, 3);
    // Roof: a verdigris pyramid, a lantern with glowing windows, a spire and a gear weathervane.
    const R0 = C1 + 0.6, L0 = R0 + 6.4;
    k.add(new THREE.CylinderGeometry(2.7, 9.0, 6.4, 4, 1).rotateY(Math.PI / 4), roof, { p: [0, R0 + 3.2, 0], grad: 0.2, jit: 0.03 });
    k.add(new THREE.BoxGeometry(3.8, 3.4, 3.8), CREAM, { p: [0, L0 + 1.7, 0] });
    FACES.forEach((n) => k.glow(slab(archWin(1.3, 1.5), 0.06, 6).translate(0, L0 + 0.6, 0), LAMP[1], { m: onFace(n, 1.92) }));
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => k.add(new THREE.BoxGeometry(0.5, 3.4, 0.5), fl, { p: [sx * 1.9, L0 + 1.7, sz * 1.9] })));
    k.add(new THREE.BoxGeometry(4.4, 0.5, 4.4), fl, { p: [0, L0 + 3.6, 0] });
    k.add(new THREE.ConeGeometry(3.1, 6.2, 4).rotateY(Math.PI / 4), roof, { p: [0, L0 + 3.85 + 3.1, 0], grad: 0.2 });
    const T0 = L0 + 3.85 + 6.2;
    k.add(ico(0.45, 1), fl, { p: [0, T0 + 0.2, 0] });
    k.add(rod([0, T0, 0], [0, T0 + 2.6, 0], 0.08, 0.08, 5), fl);
    k.add(gearGeo(0.9, 8, 0.12, { tooth: 0.25, hub: 0.2 }), fl, { p: [0, T0 + 1.9, 0] });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A riveted iron frame carrying a tall stack of five big meshing gears that turn together (~45 m; faces the road). */
  prop('gear_tower', (r) => {
    const k = new Kit(r), frame = pick(SOOT, r, 0.02), dark = shade(frame, -0.07), fl = pick(BRASS, r, 0.02), brick = pick(BRICK, r, 0.02);
    const CX = 13.4, TOP = 39, GZ = -1.8, GD = 0.9, TOOTH = 1.0;
    const train = gearTrain([{ n: 24, p: [-3, 10], theta: r.range(0, 1) }, { n: 12, at: 0.55 }, { n: 18, at: 2.0 }, { n: 14, at: 2.2 }, { n: 8, at: 0.35 }], 2.0, TOOTH);
    // Brick footing, a cream sill, two riveted columns with brass bands, domes and lamps.
    k.add(new THREE.BoxGeometry(2 * CX + 4.4, 1.4, 6.6, 3, 1, 1), brick, { p: [0, 0.7, 0], jit: 0.04 });
    k.add(new THREE.BoxGeometry(2 * CX + 4.8, 0.4, 7.0), CREAM, { p: [0, 1.6, 0] });
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(2.0, TOP - 1.8, 2.0, 1, 8, 1), (cx, cy) => (Math.floor(cy / 4.6) % 2 ? frame : dark), { p: [s * CX, 1.8 + (TOP - 1.8) / 2, 0], jit: 0.03 });
      for (let y = 6; y < TOP - 2; y += 8) k.add(new THREE.BoxGeometry(2.4, 0.5, 2.4), fl, { p: [s * CX, y, 0] });
      k.add(new THREE.BoxGeometry(2.8, 0.8, 2.8), fl, { p: [s * CX, TOP + 2.7, 0] });
      k.add(new THREE.SphereGeometry(1.1, 10, 5, 0, TAU, 0, HALF_PI), fl, { p: [s * CX, TOP + 3.1, 0] });
      k.glow(ico(0.7, 1), LAMP[0], { p: [s * CX, TOP + 4.8, 0] });
    });
    // Top girder with a row of warm lamps and a brass crest gear.
    k.add(new THREE.BoxGeometry(2 * CX + 2.4, 2.6, 2.0), frame, { p: [0, TOP + 1.0, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(2 * CX + 2.6, 0.35, 2.2), fl, { p: [0, TOP + 2.45, 0] });
    for (let i = -4; i <= 4; i++) k.glow(ico(0.38, 0), i % 2 ? LAMP[1] : LAMP[0], { p: [i * 2.6, TOP + 1.0, -1.05] });
    k.add(gearGeo(2.6, 12, 0.6, { tooth: 0.6, hub: 0.6 }), fl, { p: [0, TOP + 5.0, 0] });
    k.glow(new THREE.CircleGeometry(0.62, 10), LAMP[2], { r: [0, Math.PI, 0], p: [0, TOP + 5.0, -0.05] });
    // The gear stack: struts back to the columns, axles, then the gears on one rig.
    train.forEach((g) => {
      const s = g.x < 0 ? -1 : 1;
      k.add(bar([g.x, g.y, 0.3], [s * CX, g.y, 0.3], 0.7, 0.7), dark);
      k.add(rod([g.x, g.y, GZ + GD / 2], [g.x, g.y, 0.3], 0.35, 0.35, 8), IRON);
    });
    const cols = [[pick(BRASS, r, 0.02), IRON], [pick(COPPER, r, 0.02), fl], [pick(IRONRED, r, 0.02), fl], [pick(BRASS, r, 0.02), IRON], [pick(COPPER, r, 0.02), fl]];
    const nodes = train.map((g, i) => { const nd = new THREE.Group(); gearPart(k, g, GZ, GD, TOOTH, cols[i], nd); return nd; });
    gearRig(k, train, nodes, 0.25 * r.sign());
    // A brass whistle puffing on the girder.
    const wx = r.sign() * 7;
    k.add(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8), fl, { p: [wx, TOP + 2.9, 0] });
    puff(k, wx, TOP + 4.2, 0, 0.7, 0.85, [0xfff8ec, 0xe6d6c4], 7);
    puff(k, wx + 0.6, TOP + 5.2, 0.2, 0.5, 0.85, [0xfff8ec, 0xe6d6c4], 6);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Gear-pit dressing (the molten metal surface is the engine's) ───── */

  /** A huge brass gear standing upright, half sunk, turning slowly about its axle along X (origin = gear centre, 22 m across). */
  prop('gear_giant', (r) => {
    const k = new Kit(r), R = 11, D = 2.4, T = 1.7, plate = pick(BRASS, r, 0.02), rim = shade(plate, 0.08), ring = shade(plate, -0.1);
    const hub = pick(COPPER, r, 0.02), frame = pick(IRONRED, r, 0.02);
    const node = new THREE.Group();
    k.add(gearGeo(R, 24, D, { tooth: T, win: 6, wIn: R * 0.32, wOut: (R - T) * 0.76, spoke: 0.4 }), (cx, cy, cz) => (Math.hypot(cy, cz) > R - T * 1.05 ? rim : plate),
      { r: [0, HALF_PI, 0], jit: 0.03 }, node);
    [-1, 1].forEach((s) => {
      k.add(new THREE.TorusGeometry(R - T - 0.55, 0.42, 4, 36), ring, { r: [0, HALF_PI, 0], p: [s * D / 2, 0, 0] }, node);
      k.add(new THREE.TorusGeometry(R * 0.32, 0.36, 4, 20), ring, { r: [0, HALF_PI, 0], p: [s * D / 2, 0, 0] }, node);
      k.add(new THREE.CylinderGeometry(1.25, 1.25, 0.35, 12), plate, { r: [0, 0, HALF_PI], p: [s * D * 1.7, 0, 0] }, node);
    });
    k.add(new THREE.CylinderGeometry(2.3, 2.3, D * 1.6, 16), hub, { r: [0, 0, HALF_PI] }, node);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      k.add(new THREE.CylinderGeometry(0.3, 0.3, D * 1.6 + 0.3, 6), shade(hub, 0.15), { r: [0, 0, HALF_PI], p: [0, Math.cos(a) * 1.65, Math.sin(a) * 1.65] }, node);
    }
    k.add(new THREE.CylinderGeometry(0.95, 0.95, D * 3.4, 12), IRON, { r: [0, 0, HALF_PI] }, node);
    const g = keep(node);
    k.root.add(g);
    spin(k, g, 'x', 0.1 * r.sign());
    // Bearing blocks on A-frame legs that sink into the molten metal.
    [-1, 1].forEach((s) => {
      const x = s * 3.6;
      k.add(new THREE.BoxGeometry(1.0, 2.8, 2.8), frame, { p: [x, 0, 0] });
      k.add(new THREE.BoxGeometry(1.1, 0.4, 3.0), pick(BRASS, r, 0.02), { p: [x, 1.5, 0] });
      [-1, 1].forEach((sz) => k.add(bar([x, -0.8, sz * 0.6], [x, -12.5, sz * 5.5], 0.8, 0.8), frame));
      k.add(bar([x, -8, -3.6], [x, -8, 3.6], 0.6, 0.6), shade(frame, -0.1));
    });
    return finishAt(k);
  });

  /**
   * A giant tipping crucible on a riveted gantry, pouring a glowing stream
   * into the pit; the falling stream turns so its stripes run downward
   * (origin = the molten surface, the pillars sunk below it; ~17 m).
   */
  prop('molten_pour', (r) => {
    const k = new Kit(r), frame = pick(IRONRED, r, 0.02), iron = 0x3a3440, fl = pick(BRASS, r, 0.02), cu = pick(COPPER, r, 0.02);
    const HOT = 0xff5a00, HOT2 = 0xff7a10, HOT3 = 0xff9a1a, PX = 5.8, PY = 11.0, TILT = -1.12;
    // Gantry: two pillars rising out of the pool (glowing where they meet it), a beam, a warning lamp.
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(1.5, 20, 1.7, 1, 10, 1), (cx, cy) => (cy < 1.0 ? 0xd8501e : frame), { p: [s * PX, 4, 0], jit: 0.03 });
      [3.5, 8.0].forEach((y) => k.add(new THREE.BoxGeometry(1.8, 0.4, 2.0), fl, { p: [s * PX, y, 0] }));
      k.glow(new THREE.CylinderGeometry(1.5, 1.75, 0.3, 10), HOT, { p: [s * PX, 0.05, 0] });
      k.add(new THREE.CylinderGeometry(0.95, 0.95, 0.9, 12), fl, { r: [0, 0, HALF_PI], p: [s * (PX - 1.1), PY, 0] });
    });
    k.add(new THREE.BoxGeometry(2 * PX + 2.6, 1.4, 2.0), frame, { p: [0, 14.7, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(2 * PX + 3.0, 0.4, 2.3), fl, { p: [0, 15.6, 0] });
    k.add(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 8), IRON, { p: [0, 16.05, 0] });
    k.glow(ico(0.55, 1), LAMP[0], { p: [0, 16.65, 0] });
    // The tipping gear and its pinion outside the +X pillar.
    const gx = PX + 1.1;
    k.add(gearGeo(2.6, 16, 0.4, { tooth: 0.5, hub: 0.3 }), cu, { r: [0, HALF_PI, 0], p: [gx, PY, 0], jit: 0.03 });
    k.add(gearGeo(1.1, 8, 0.4, { tooth: 0.45, hub: 0.15 }), fl, { r: [0, HALF_PI, 0], p: [gx, PY - 3.25, 0] });
    k.add(rod([PX, PY - 3.25, 0], [gx + 0.4, PY - 3.25, 0], 0.2, 0.2, 6), IRON);
    // The crucible, built upright about its trunnions, then tipped toward -Z.
    const cru = new THREE.Group();
    const prof = [[0.05, -2.3], [1.7, -2.3], [2.3, -1.9], [2.65, -0.8], [2.8, 0.6], [2.9, 1.8], [3.15, 2.05], [3.15, 2.35], [2.6, 2.35], [2.5, 1.9]];
    k.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18), (cx, cy) => (cy > -0.1 && cy < 0.7 ? cu : (cy > 2.0 ? fl : iron)), { jit: 0.03 }, cru);
    k.glow(new THREE.CircleGeometry(2.55, 18), (cx, cy, cz) => (hash3(cx, 0, cz, 3) > 0.2 ? HOT3 : HOT2), { r: [-HALF_PI, 0, 0], p: [0, 1.95, 0] }, cru);
    k.add(new THREE.CylinderGeometry(0.55, 0.55, 2 * (PX - 1.1), 10), fl, { r: [0, 0, HALF_PI] }, cru);
    [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(0.7, 1.8, 1.8), cu, { p: [s * 2.95, 0, 0] }, cru));
    // A pouring lip with molten metal in it.
    k.add(new THREE.BoxGeometry(1.5, 0.35, 1.5), fl, { p: [0, 2.2, -3.2] }, cru);
    [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(0.2, 0.5, 1.5), fl, { p: [s * 0.75, 2.45, -3.2] }, cru));
    k.glow(new THREE.PlaneGeometry(1.3, 1.6), HOT3, { r: [-HALF_PI, 0, 0], p: [0, 2.39, -3.15] }, cru);
    cru.rotation.x = TILT;
    cru.position.set(0, PY, 0);
    k.root.add(cru);
    // The stream: a curl off the lip (static), then a turning striped column down to the pool.
    const tip = new THREE.Vector3(0, 2.3, -3.95).applyEuler(new THREE.Euler(TILT, 0, 0)).add(new THREE.Vector3(0, PY, 0));
    const SZ = tip.z - 0.8, SH = tip.y - 2.0;
    k.glow(tubeGeo([[0, tip.y + 0.15, tip.z + 0.1], [0, tip.y - 0.5, tip.z - 0.45], [0, tip.y - 1.5, SZ], [0, tip.y - 2.6, SZ]], 0.55, 12, 8), HOT2);
    const sn = new THREE.Group();
    k.glow(new THREE.CylinderGeometry(0.52, 0.66, SH, 8, 10, true), (cx, cy, cz) => ((Math.floor(Math.atan2(cz, cx) / TAU * 4 + cy * 0.55 + 40) & 1) ? HOT2 : HOT3),
      { p: [0, SH / 2, 0] }, sn);
    const st = keep(sn);
    st.position.set(0, 0, SZ);
    k.root.add(st);
    spin(k, st, 'y', -2.4);
    // Splash: a glowing mound, a ring and a crown of droplets.
    k.glow(new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, HALF_PI), HOT3, { s: [1.7, 0.6, 1.7], p: [0, 0, SZ] });
    k.glow(new THREE.TorusGeometry(1.9, 0.2, 4, 16), HOT, { r: [HALF_PI, 0, 0], p: [0, 0.1, SZ] });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + r.range(-0.2, 0.2), d = r.range(1.5, 2.1);
      k.glow(ico(r.range(0.16, 0.26), 0), i % 2 ? HOT2 : HOT3, { p: [Math.cos(a) * d, r.range(0.5, 1.2), SZ + Math.sin(a) * d] });
    }
    return finishAt(k);
  });

  /**
   * A snapped iron catwalk jutting out over the drop: grated deck, rails,
   * struts to the pit wall, the far end bent down with a torn rail, a
   * caution sign and a caged lamp (origin = the rim edge; walkway toward -Z).
   */
  prop('catwalk_broken', (r) => {
    const k = new Kit(r), girder = pick(IRONRED, r, 0.02), deck = pick(SOOT, r, 0.02), rail = pick(BRASS, r, 0.02);
    const W = 2.2, hw = W / 2, Z0 = 2.4, ZB = -4.4, BEND = r.range(0.55, 0.7), LB = 2.7, Y = 0.3, RH = 1.1;
    const dir = [0, -Math.sin(BEND), -Math.cos(BEND)], upB = [0, Math.cos(BEND), -Math.sin(BEND)];
    const at = (s) => (s <= 0 ? [0, Y, ZB - s] : [0, Y + dir[1] * s, ZB + dir[2] * s]);
    const nrm = (s) => (s > 0 ? upB : [0, 1, 0]);
    const off = (s, x, h) => { const p = at(s), n = nrm(s); return [x, p[1] + n[1] * h, p[2] + n[2] * h]; };
    const S0 = -(Z0 - ZB);
    // Stringers: plain on the flat run, hazard-striped on the bent end.
    [-hw, hw].forEach((x) => {
      k.add(bar(off(S0, x, -0.16), off(0, x, -0.16), 0.2, 0.36), girder);
      k.add(span(new THREE.BoxGeometry(0.2, LB, 0.36, 1, 8, 1), off(0, x, -0.16), off(LB, x, -0.16)),
        (cx, cy, cz) => ((Math.floor(Math.hypot(cy - Y, cz - ZB) * 3) & 1) ? 0xffc21f : 0x2a2430));
    });
    // Grating slats; the last few at the snapped end hang askew.
    for (let s = S0 + 0.15; s < LB - 0.15; s += 0.34) {
      const p = at(s), bent = s > 0, jag = s > LB - 0.9;
      k.add(new THREE.BoxGeometry(jag ? W * r.range(0.5, 0.85) : W, 0.06, 0.2), deck,
        { r: [bent ? -BEND : 0, 0, jag ? r.range(-0.15, 0.15) : 0], p: [jag ? r.range(-0.3, 0.3) : 0, p[1] - 0.03, p[2]] });
    }
    // Railings: the left one follows the bend and tears at the end; the right one snaps at the bend and dangles.
    const flatS = [S0 + 0.1, -5.0, -3.3, -1.6, 0];
    const leftS = flatS.concat([1.3, LB - 0.1]);
    leftS.forEach((s) => k.add(bar(off(s, -hw, 0), off(s, -hw, RH), 0.11), girder));
    for (let i = 0; i + 1 < leftS.length; i++) {
      k.add(bar(off(leftS[i], -hw, RH), off(leftS[i + 1], -hw, RH), 0.1), rail);
      k.add(bar(off(leftS[i], -hw, RH / 2), off(leftS[i + 1], -hw, RH / 2), 0.08), girder);
    }
    const end = off(LB - 0.1, -hw, RH);
    k.add(bar(end, [-hw - 0.25, end[1] + 0.45, end[2] - 0.35], 0.1), rail);
    const rightS = flatS.slice(0, 4);
    rightS.forEach((s) => k.add(bar(off(s, hw, 0), off(s, hw, RH), 0.11), girder));
    for (let i = 0; i + 1 < rightS.length; i++) {
      k.add(bar(off(rightS[i], hw, RH), off(rightS[i + 1], hw, RH), 0.1), rail);
      k.add(bar(off(rightS[i], hw, RH / 2), off(rightS[i + 1], hw, RH / 2), 0.08), girder);
    }
    const last = off(-1.6, hw, RH), kink = [hw + 0.12, Y + 0.75, ZB + 0.55];
    k.add(bar(last, kink, 0.1), rail);
    k.add(bar(kink, [hw + 0.38, Y - 1.25, ZB + 0.25], 0.1), rail);
    // Struts down to a plate on the pit wall, and a cross-beam under the deck.
    [-1, 1].forEach((s) => k.add(bar([s * (hw - 0.1), -3.6, -0.15], [s * (hw - 0.1), Y - 0.3, -2.9], 0.2), girder));
    k.add(new THREE.BoxGeometry(W + 0.6, 0.8, 0.3), deck, { p: [0, -3.6, -0.15] });
    k.add(new THREE.BoxGeometry(W + 0.4, 0.3, 0.3), girder, { p: [0, Y - 0.4, -2.9] });
    k.add(new THREE.BoxGeometry(W + 0.8, 0.3, 0.9), shade(deck, 0.1), { p: [0, 0.12, Z0 - 0.45] });
    // A yellow caution diamond on the right rail, facing out.
    const sz = ZB + 3.3;
    k.add(slab(polyShape([[0, -0.42], [0.42, 0], [0, 0.42], [-0.42, 0]]), 0.04), 0xffc21f, { r: [0, HALF_PI, 0], p: [hw + 0.08, Y + 0.62, sz] });
    k.add(new THREE.BoxGeometry(0.03, 0.3, 0.08), 0x2a2430, { p: [hw + 0.11, Y + 0.68, sz] });
    k.add(new THREE.BoxGeometry(0.03, 0.08, 0.08), 0x2a2430, { p: [hw + 0.11, Y + 0.43, sz] });
    // A caged lamp on a post at the rim end.
    const lx = -hw - 0.35, lz = Z0 - 0.5;
    k.add(rod([lx, 0, lz], [lx, 2.6, lz], 0.07, 0.06, 5), girder);
    k.add(new THREE.ConeGeometry(0.32, 0.22, 8), rail, { p: [lx, 2.72, lz] });
    k.glow(ico(0.22, 1), LAMP[0], { s: [1, 1.2, 1], p: [lx, 2.42, lz] });
    k.add(new THREE.TorusGeometry(0.25, 0.025, 3, 8), IRON, { r: [HALF_PI, 0, 0], p: [lx, 2.42, lz] });
    return finishAt(k);
  });

  /* ── Factory set pieces over the road ────────────────────────────────── */

  /** Three points along a quarter arc (exclusive of its ends) of radius rad round (cx, cy), from angle a0 to a1, at depth z. */
  function arcPts(cx, cy, a0, a1, rad, z) {
    const out = [];
    for (let i = 1; i < 4; i++) { const a = a0 + (a1 - a0) * i / 4; out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z]); }
    return out;
  }
  /** A round gauge facing `fs` (-1: -Z, +1: +Z) at (x, y, z): brass case, dial, ticks, a red needle. */
  function gauge(k, x, y, z, R, fs, fl, rng, glowDial) {
    const ry = fs < 0 ? Math.PI : 0;
    k.add(new THREE.CylinderGeometry(R, R, 0.36, 18), fl, { r: [HALF_PI, 0, 0], p: [x, y, z] });
    const dz = z + fs * 0.19;
    if (glowDial) k.glow(new THREE.CircleGeometry(R * 0.84, 18), 0xffc45a, { r: [0, ry, 0], p: [x, y, dz] });
    else k.add(new THREE.CircleGeometry(R * 0.84, 18), CREAM, { r: [0, ry, 0], p: [x, y, dz] });
    // Ticks round a 260° scale, clockwise as seen from outside (the viewer's right is +X·fs).
    for (let i = 0; i < 9; i++) {
      const a = -2.3 + i / 8 * 4.6;
      k.add(new THREE.BoxGeometry(R * 0.07, R * 0.2, 0.03), 0x2a2430, { r: [0, ry, -a], p: [x + fs * Math.sin(a) * R * 0.66, y + Math.cos(a) * R * 0.66, dz + fs * 0.01] });
    }
    const na = rng.range(-1.6, 1.6);
    k.add(new THREE.BoxGeometry(R * 0.08, R * 0.62, 0.03).translate(0, R * 0.26, 0), VALVE_RED, { r: [0, ry, na], p: [x, y, dz + fs * 0.025] });
    k.add(new THREE.CylinderGeometry(R * 0.1, R * 0.1, 0.1, 8), fl, { r: [HALF_PI, 0, 0], p: [x, y, dz + fs * 0.03] });
  }
  /** A red handwheel of radius R facing Z at (x, y, z): rim, four spokes, a brass hub. */
  function handwheel(k, x, y, z, R, fl) {
    k.add(new THREE.TorusGeometry(R, R * 0.11, 5, 16), VALVE_RED, { p: [x, y, z] });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      k.add(bar([x, y, z], [x + Math.cos(a) * R, y + Math.sin(a) * R, z], R * 0.1, R * 0.08), VALVE_RED);
    }
    k.add(new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.25, 8), fl, { r: [HALF_PI, 0, 0], p: [x, y, z] });
  }

  /**
   * A big pipe-frame archway: a fat copper pipe up both sides and across
   * the top with a row of brass nozzles pointing down into the opening (the
   * engine hangs a steam curtain there), outer vent stacks with whistles,
   * valves, gauges, lamps and a glowing pressure dial on the crown
   * (~36 × 19 m, 5.4 m deep; opening |x| < 12.5, y < 12 clear).
   */
  prop('steam_gate', (r) => {
    const k = new Kit(r), main = pick(COPPER, r, 0.02), back = pick(IRONRED, r, 0.02), fl = pick(BRASS, r, 0.02), brick = pick(BRICK, r, 0.02);
    const LX = 14.6, PR = 1.25, TY = 14.0, CR = 2.2, OX = 16.6, OR = 0.75, OZ = 1.5;
    // Brick plinths at the feet.
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(5.2, 1.6, 5.4, 2, 1, 2), brick, { p: [s * 15.5, 0.8, 0.3], jit: 0.04 });
      k.add(new THREE.BoxGeometry(5.6, 0.3, 5.8), CREAM, { p: [s * 15.5, 1.75, 0.3] });
      k.add(new THREE.CylinderGeometry(PR * 1.4, PR * 1.5, 0.4, 12), fl, { p: [s * LX, 2.05, 0] });
      k.add(new THREE.CylinderGeometry(OR * 1.45, OR * 1.55, 0.35, 10), fl, { p: [s * OX, 2.0, OZ] });
    });
    // The main pipe: up, round a corner, across, round, down.
    const mainPts = [[-LX, 1.8, 0], [-LX, 7, 0], [-LX, TY - CR, 0]].concat(arcPts(-(LX - CR), TY - CR, Math.PI, HALF_PI, CR, 0),
      [[-(LX - CR), TY, 0], [-5, TY, 0], [5, TY, 0], [LX - CR, TY, 0]], arcPts(LX - CR, TY - CR, HALF_PI, 0, CR, 0),
      [[LX, TY - CR, 0], [LX, 7, 0], [LX, 1.8, 0]]);
    pipeRun(k, mainPts, PR, main, fl, [0.05, 0.17, 0.36, 0.64, 0.83, 0.95], { segs: 100, radial: 10 });
    // Brass nozzles under the top run, pointing down into the opening.
    for (let i = -3; i <= 3; i++) {
      const x = i * 3.0;
      k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), fl, { p: [x, TY - PR - 0.02, 0] });
      k.add(new THREE.CylinderGeometry(0.24, 0.42, 0.45, 10), shade(fl, -0.08), { p: [x, TY - PR - 0.38, 0] });
      k.add(new THREE.CircleGeometry(0.34, 10), 0x2a2228, { r: [HALF_PI, 0, 0], p: [x, TY - PR - 0.61, 0] });
    }
    // Outer vent stacks tied to the legs, each topped by a brass whistle and a puff of steam.
    [-1, 1].forEach((s) => {
      pipeRun(k, [[s * OX, 1.8, OZ], [s * OX, 9, OZ], [s * OX, 16.6, OZ]], OR, back, fl, [0.3, 0.75], { segs: 6, radial: 8 });
      [4.6, 11.0].forEach((y) => {
        k.add(rod([s * LX, y, 0], [s * OX, y, OZ], 0.4, 0.4, 8), back);
        k.add(new THREE.CylinderGeometry(OR * 1.3, OR * 1.3, 0.5, 10), fl, { p: [s * OX, y, OZ] });
      });
      k.add(new THREE.CylinderGeometry(0.45, 0.62, 0.9, 10), fl, { p: [s * OX, 17.0, OZ] });
      k.add(new THREE.ConeGeometry(0.5, 0.5, 10), shade(fl, 0.08), { p: [s * OX, 17.7, OZ] });
      puff(k, s * OX, 18.6, OZ, 0.75, 0.85, [0xfff8ec, 0xe6d6c4], 7);
      puff(k, s * (OX - 0.5), 19.5, OZ + 0.2, 0.55, 0.85, [0xfff8ec, 0xe6d6c4], 6);
      // Valve with a red handwheel low on each leg, a gauge higher up (both faces).
      const x = s * LX;
      k.add(new THREE.CylinderGeometry(PR * 1.25, PR * 1.25, 1.2, 12), fl, { p: [x, 4.4, 0] });
      k.add(rod([x, 4.4, -PR + 0.2], [x, 4.4, -PR - 0.75], 0.12, 0.12, 6), IRON);
      handwheel(k, x, 4.4, -PR - 0.7, 0.85, fl);
      [-1, 1].forEach((fs) => gauge(k, x, 8.6, fs * (PR + 0.05), 0.85, fs, fl, r, false));
      // A caged lamp on the crown near each corner.
      const lx = s * 10.2;
      k.add(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 6), IRON, { p: [lx, TY + PR + 0.6, 0] });
      k.add(new THREE.ConeGeometry(0.55, 0.35, 10), fl, { p: [lx, TY + PR + 2.05, 0] });
      k.glow(ico(0.42, 1), LAMP[0], { s: [1, 1.15, 1], p: [lx, TY + PR + 1.55, 0] });
    });
    // A big glowing pressure dial on the crown, both faces.
    const GY = TY + PR + 1.7;
    k.add(new THREE.CylinderGeometry(2.3, 2.3, 1.0, 24), fl, { r: [HALF_PI, 0, 0], p: [0, GY, 0] });
    k.add(new THREE.TorusGeometry(2.3, 0.18, 4, 24), shade(fl, -0.12), { p: [0, GY, 0] });
    [-1, 1].forEach((fs) => gauge(k, 0, GY, fs * 0.33, 2.0, fs, fl, r, true));
    k.add(ico(0.35, 0), shade(fl, 0.1), { p: [0, GY + 2.45, 0] });
    const out = finishAt(k);
    clearOpening(out, 0.02);
    out.userData.faceRoad = true;
    return out;
  });

  /** A single big riveted pipe bent in an arch over the road, bolted flanges, a crown valve with a red wheel, a gauge and a puffing vent (~31 × 18 m, 2.9 m deep). */
  prop('pipe_arch', (r) => {
    const k = new Kit(r), main = pick(r.pick([COPPER, IRONRED, COPPER]), r, 0.02), fl = pick(BRASS, r, 0.02), stone = pick(SOOT, r, 0.02);
    const HW = 14.0, Y0 = 9.0, RISE = 6.6, PR = 0.95, FR = PR * 1.36, TOPY = Y0 + RISE;
    const pts = archPath(HW, Y0, RISE, 4, 24);
    pts[0][1] = 1.0; pts[pts.length - 1][1] = 1.0;
    const curve = pipeRun(k, pts, PR, main, fl, [], { segs: 96, radial: 10 });
    // Bolted flanges: a collar with a ring of bolt studs through it.
    const fls = [0.03, 0.17, 0.33, 0.67, 0.83, 0.97], bolt = shade(fl, -0.15);
    fls.forEach((t) => {
      const c = curve.getPointAt(t), d = curve.getTangentAt(t), h = PR * 0.3;
      const a = [c.x - d.x * h, c.y - d.y * h, c.z - d.z * h], b = [c.x + d.x * h, c.y + d.y * h, c.z + d.z * h];
      k.add(rod(a, b, FR, FR, 12), fl);
      const nx = -d.y, ny = d.x;
      for (let i = 0; i < 8; i++) {
        const ang = (i + 0.5) / 8 * TAU, ox = Math.cos(ang) * nx * FR * 0.8, oy = Math.cos(ang) * ny * FR * 0.8, oz = Math.sin(ang) * FR * 0.8;
        k.add(rod([a[0] + ox - d.x * 0.1, a[1] + oy - d.y * 0.1, a[2] + oz], [b[0] + ox + d.x * 0.1, b[1] + oy + d.y * 0.1, b[2] + oz], 0.1, 0.1, 4), bolt);
      }
    });
    // Rivet seams along the front and back of the pipe.
    const n = Math.floor(curve.getLength() / 1.1), rivet = shade(main, 0.12);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (fls.some((f) => Math.abs(f - t) < 0.02) || Math.abs(t - 0.5) < 0.05) continue;
      const c = curve.getPointAt(t);
      [-1, 1].forEach((s) => k.add(new THREE.OctahedronGeometry(0.12, 0), rivet, { p: [c.x, c.y, s * (PR - 0.02)] }));
    }
    // Feet: stone blocks with brass base flanges and little warm lamps.
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(2.8, 1.1, 2.6, 2, 1, 2), stone, { p: [s * HW, 0.55, 0], jit: 0.04 });
      k.add(new THREE.CylinderGeometry(FR * 1.0, FR * 1.1, 0.45, 12), fl, { p: [s * HW, 1.3, 0] });
      k.add(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 5), IRON, { p: [s * (HW + 1.05), 1.75, -0.85] });
      k.add(new THREE.ConeGeometry(0.3, 0.2, 8), fl, { p: [s * (HW + 1.05), 2.8, -0.85] });
      k.glow(ico(0.26, 1), LAMP[0], { p: [s * (HW + 1.05), 2.55, -0.85] });
    });
    // The crown valve: a brass body, bonnet and stem, and a red handwheel tipped toward the karts.
    k.add(new THREE.SphereGeometry(1.4, 12, 8), fl, { s: [1.15, 1, 1], p: [0, TOPY, 0] });
    k.add(new THREE.CylinderGeometry(0.5, 0.65, 0.9, 10), fl, { p: [0, TOPY + 1.45, 0] });
    k.add(rod([0, TOPY + 1.9, 0], [0, TOPY + 2.35, 0], 0.12, 0.12, 6), IRON);
    const wM = new THREE.Matrix4().makeRotationX(0.94).setPosition(0, TOPY + 2.35, 0);
    const wR = 1.0;
    k.add(new THREE.TorusGeometry(wR, 0.12, 5, 18), VALVE_RED, { m: wM });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      k.add(bar([0, 0, 0], [Math.cos(a) * wR, Math.sin(a) * wR, 0], 0.1, 0.08), VALVE_RED, { m: wM });
    }
    k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8), fl, { r: [HALF_PI, 0, 0], m: wM });
    // A gauge on one leg, a puffing vent on the other shoulder.
    const side = r.sign();
    gauge(k, side * HW, 6.0, -(PR + 0.05), 0.7, -1, fl, r, false);
    const vc = curve.getPointAt(side > 0 ? 0.36 : 0.64);
    k.add(rod([vc.x, vc.y + PR * 0.7, 0], [vc.x, vc.y + PR + 0.9, 0], 0.22, 0.22, 8), fl);
    k.add(new THREE.ConeGeometry(0.34, 0.4, 8), shade(fl, 0.08), { p: [vc.x, vc.y + PR + 1.1, 0] });
    puff(k, vc.x, vc.y + PR + 1.9, 0, 0.55, 0.85, [0xfff8ec, 0xe6d6c4], 7);
    puff(k, vc.x - side * 0.5, vc.y + PR + 2.6, 0.1, 0.4, 0.85, [0xfff8ec, 0xe6d6c4], 6);
    const out = finishAt(k);
    clearOpening(out, 0.02);
    return out;
  });

  /* ── Factory hazards ────────────────────────────────────────────────── */

  /** Block: a big planked crate with brass corner caps, a diagonal brace and cog stencils. */
  hazard('crate_block', 'block', 'factory', (r) => {
    const k = new Kit(r, true), wood = pick(WOOD, r, 0.02), fl = pick(BRASS, r, 0.02), ink = r.pick([0xb8402e, 0x2f6a8a, 0x3a3238]);
    crate(k, 2.4, wood, null, { corners: fl });
    [-1, 1].forEach((s) => {
      // A big cog on each open side, a small one in the free corner of each braced face.
      k.add(slab(gearShape(0.62, 10, { tooth: 0.17, hub: 0.22 }), 0.03), ink, { r: [0, s * HALF_PI, 0], p: [s * 1.2, 1.2, 0], noInk: true });
      k.add(slab(gearShape(0.3, 8, { tooth: 0.1, hub: 0.1 }), 0.03), ink, { r: [0, s > 0 ? 0 : Math.PI, 0], p: [-0.5, 1.72, s * 1.2], noInk: true });
    });
    const out = sizeHazard(k, [2.8, 2.45, 2.6]);
    shadow(out, 3.4, 3.1);
    return out;
  });

  /** Roller: a bright steel oil drum on its side (axle along Z): band, rolling hoops, cog-stencilled ends with a bung. */
  hazard('oil_drum', 'roller', 'factory', (r) => {
    const k = new Kit(r, true), node = new THREE.Group(), fl = pick(BRASS, r, 0.02);
    const way = r.pick([[0xd2382e, CREAM, 0xffc21f], [0xf0b42a, 0x3a3238, 0xd2382e], [0x2f8a9a, CREAM, 0xffc21f], [0x3a64c0, 0xf0c040, CREAM]]);
    const col = tone(way[0], r, 0.02), band = way[1], mark = way[2], R = 1.0, L = 1.7, seg0 = Math.floor(r.next() * 12);
    // Body: a painted band round the middle and two dark stripes along it, so the roll shows.
    k.add(new THREE.CylinderGeometry(R, R, L, 24, 5, true), (cx, cy, cz) => {
      if (Math.abs(cz) < L * 0.12) return band;
      const s = Math.floor((Math.atan2(cy, cx) + Math.PI) / TAU * 24) % 12;
      return s === seg0 ? shade(col, -0.18) : col;
    }, { r: [HALF_PI, 0, 0], jit: 0.03 }, node);
    [-1, 1].forEach((s) => {
      k.add(new THREE.TorusGeometry(R + 0.0, 0.055, 4, 24), shade(col, -0.1), { p: [0, 0, s * L * 0.29] }, node);
      k.add(new THREE.TorusGeometry(R - 0.03, 0.08, 4, 24), shade(col, -0.12), { p: [0, 0, s * L / 2] }, node);
      k.add(new THREE.CircleGeometry(R * 0.95, 24), shade(col, -0.05), { r: [0, s > 0 ? 0 : Math.PI, 0], p: [0, 0, s * (L / 2 - 0.05)] }, node);
      k.add(slab(gearShape(0.52, 8, { tooth: 0.14, hub: 0.18 }), 0.03), mark, { r: [0, s > 0 ? 0 : Math.PI, 0], p: [0, 0, s * (L / 2 - 0.03)], noInk: true }, node);
      k.add(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 8), fl, { r: [HALF_PI, 0, 0], p: [0.66, 0.1, s * (L / 2 - 0.02)] }, node);
      k.add(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 6), fl, { r: [HALF_PI, 0, 0], p: [-0.66, -0.1, s * (L / 2 - 0.02)] }, node);
    });
    return finishRoller(k, node, R, 0.045);
  });

  /** Geyser: an elbowed steam outlet with a flared brass nozzle, a red valve and a gauge, blasting a 6 m column of warm steam. */
  hazard('steam_pipe', 'geyser', 'factory', (r) => {
    const k = new Kit(r, true), col = pick(r.chance(0.5) ? COPPER : IRONRED, r, 0.02), fl = pick(BRASS, r, 0.02), iron = 0x4e4854;
    k.add(new THREE.CylinderGeometry(1.0, 1.06, 0.1, 20), iron, { p: [0, 0.05, 0] });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2;
      k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), 0x2a2830, { p: [Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9] });
    }
    // The riser with flanges and a flared nozzle (top under 1 m).
    k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 12), col, { p: [0, 0.4, 0], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(0.42, 0.44, 0.12, 12), fl, { p: [0, 0.16, 0] });
    k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 12), fl, { p: [0, 0.66, 0] });
    k.add(new THREE.CylinderGeometry(0.5, 0.32, 0.24, 14, 1, true), fl, { p: [0, 0.82, 0] });
    k.add(new THREE.TorusGeometry(0.48, 0.05, 4, 14), shade(fl, 0.08), { r: [HALF_PI, 0, 0], p: [0, 0.93, 0] });
    k.add(new THREE.CircleGeometry(0.44, 14), 0x2a2228, { r: [-HALF_PI, 0, 0], p: [0, 0.76, 0], noInk: true });
    // A branch from a ground socket, with a red valve wheel on top.
    pipeRun(k, [[-1.05, 0.3, 0], [-0.75, 0.32, 0], [-0.3, 0.38, 0]], 0.2, col, fl, [0.5], { segs: 6, radial: 10 });
    k.add(new THREE.BoxGeometry(0.42, 0.5, 0.7), shade(iron, 0.06), { p: [-1.05, 0.25, 0] });
    k.add(rod([-0.68, 0.45, 0], [-0.68, 0.68, 0], 0.05, 0.05, 6), IRON);
    k.add(new THREE.TorusGeometry(0.2, 0.05, 4, 12), VALVE_RED, { r: [HALF_PI, 0, 0], p: [-0.68, 0.7, 0] });
    k.add(new THREE.BoxGeometry(0.42, 0.04, 0.06), VALVE_RED, { p: [-0.68, 0.7, 0] });
    // A little gauge on the riser, toward the karts.
    k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), fl, { r: [HALF_PI, 0, 0], p: [0, 0.42, 0.33] });
    k.add(new THREE.CircleGeometry(0.14, 12), CREAM, { p: [0, 0.42, 0.375], noInk: true });
    k.add(new THREE.BoxGeometry(0.025, 0.11, 0.01), VALVE_RED, { r: [0, 0, -0.6], p: [0.03, 0.44, 0.385], noInk: true });
    A.ink(k.root, 0.035);
    const out = finish(k);
    return geyserRig(out, steamColumn(r, [0xfff6e8, 0xe8d4bc], 0.8));
  });

  /** Puddle: a dark oil spill with warm copper-and-gold sheen bands, a couple of stray brass nuts and drips. */
  hazard('oil_puddle', 'puddle', 'factory', (r) => {
    const k = new Kit(r, true), HW = 1.8, HL = 3.0, dark = 0x241812, dark2 = 0x36261c, fl = pick(BRASS, r, 0.02);
    const bands = [0xc8683a, 0xe8a83a, 0x9a5ac8, 0x3aa0a0];
    const p1 = r.range(0, TAU), p2 = r.range(0, TAU);
    const radii = [];
    for (let i = 1; i <= 13; i++) radii.push(i / 14);
    radii.push(0.955, 1);
    puddleBase(k, radii, (rho, x, z) => {
      const a = Math.atan2(z, x), s = rho * 1.7 + 0.28 * Math.sin(2 * a + p1) + 0.2 * Math.sin(3 * a + p2);
      const f = s - Math.floor(s);
      if (rho < 0.14) return dark2;
      return f > 0.58 && f < 0.86 ? bands[Math.min(3, Math.floor((f - 0.58) / 0.07))] : (f < 0.28 ? dark : dark2);
    }, 0x120a06, HW, HL);
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.CircleGeometry(1, 10), 0xfff2dc, { s: [0.22 - i * 0.04, 0.08, 1], r: [-HALF_PI, 0, r.range(0, TAU)], p: [r.range(-0.6, 0.6), 0.035, r.range(-1.6, 1.6)], noInk: true });
    }
    for (let i = 0; i < 2; i++) {
      const x = r.range(-0.9, 0.9), z = r.range(-2.0, 2.0);
      k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 6), fl, { r: [0, r.range(0, 1), 0], p: [x, 0.06, z] });
      k.add(new THREE.CircleGeometry(0.07, 8), 0x2a2228, { r: [-HALF_PI, 0, 0], p: [x, 0.105, z], noInk: true });
    }
    for (let i = 0; i < 6; i++) {
      const a = r.range(0, TAU), rad = r.range(0.12, 0.2);
      k.add(new THREE.SphereGeometry(rad, 8, 4, 0, TAU, 0, HALF_PI), dark2, { s: [1.3, 0.5, 1.3], p: [Math.cos(a) * HW * 0.82, 0.02, Math.sin(a) * HL * 0.84] });
    }
    A.ink(k.root, 0.03);
    return finish(k, 0.02);
  });

  return { THEMES, DRESSING };
})();
