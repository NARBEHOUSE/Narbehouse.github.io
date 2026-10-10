/**
 * NARBE Racer — Wonder Cup scenery and hazards: Jungle Falls and Floating Isles.
 *
 * Every prop and hazard the two Wonder themes list, registered exactly like
 * the Sunshine and Moonlight kits: NK.art.props[name](rng) and
 * NK.art.hazard[name](rng), hazards also as NK.art.hazard['kind:theme'].
 *
 * How they are built (same rules as props-sunshine.js):
 *   - Scenery is vertex-painted and drawn with the ONE shared flat Lambert
 *     material (NK.art.mat.lambertV), welded to one mesh per material. Glowing
 *     accents (torch flames, crystals) use a second shared lambertV with a deep
 *     emissive, and falling water uses one shared scrolling texture, so no
 *     prop needs more than three draw calls.
 *   - Hazards are cel-shaded (toonV) with a dark ink hull and sized to their
 *     collision boxes (DESIGN §9.4): a block fills one lane (2.8 × ≤2.5 × 2.6),
 *     a roller is a 2 m ball centred on its rolling axis, a geyser column is
 *     1.6 m wide and 6 m tall when active, a puddle is 3.6 × 6 m at y = 0.02.
 *     Characters look toward +Z, at the karts coming up behind them.
 *   - Moving parts are pre-welded child nodes flagged userData.keep and listed
 *     in root.userData.anim (the props-sunshine animation contract).
 *
 * Origins: on the ground (lowest point y = 0) facing -Z, except the Floating
 * Isles far props and landmarks (userData.floats), whose origin is their top
 * surface or body centre as noted, and the island-underside dressing
 * (hanging_roots, hanging_crystals), whose origin is the TOP attachment point
 * with everything hanging down along -Y.
 */
NK.propsWonder = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;

  /* ── Catalogue (the contract with themes.js and world.js) ─────────────── */
  const THEMES = {
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
    }
  };
  /** Island-underside dressing, registered as props but not in a theme list. */
  const DRESSING = ['hanging_roots', 'hanging_crystals'];

  /* ── Colour ──────────────────────────────────────────────────────────── */
  const _col = new THREE.Color();
  const _col2 = new THREE.Color();
  const _hsl = { h: 0, s: 0, l: 0 };

  /** A sibling of `hex`: lightness nudged by up to ±dl, hue by a hair. */
  function tone(hex, rng, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    const h = _hsl.h + rng.range(-0.012, 0.012);
    _col.setHSL(h - Math.floor(h), _hsl.s, U.clamp(_hsl.l + rng.range(-dl, dl), 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function pick(list, rng, dl) { return tone(rng.pick(list), rng, dl === undefined ? 0.04 : dl); }
  function shade(hex, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    _col.setHSL(_hsl.h, _hsl.s, U.clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function mixHex(a, b, t) { return _col.setHex(a).lerp(_col2.setHex(b), U.clamp(t, 0, 1)).getHex(); }

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
    const span = grad ? ((y1 - y0) || 1) : 1;
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
      if (grad) d += grad * (U.clamp((cy - y0) / span, 0, 1) - 0.5);
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
  /** Point a geometry built along +Y from a to b. */
  function span(geo, a, b) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  /** Turn a geometry built along +Y to point along d, then move it to p. */
  function orient(geo, d, p) {
    _dir.set(d[0], d[1], d[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set(p[0], p[1], p[2]);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  /** A round rod from a to b (radius r0 at a, r1 at b). */
  const rod = (a, b, r0, r1, seg) => span(new THREE.CylinderGeometry(r1, r0, dist(a, b), seg || 5, 1), a, b);
  /** A square bar from a to b. */
  const bar = (a, b, w, d) => span(new THREE.BoxGeometry(w, dist(a, b), d === undefined ? w : d), a, b);

  /** Pseudo-random -1..1 from a position, so vertices duplicated along seams agree. */
  function hash3(x, y, z, seed) {
    const h = Math.sin(Math.round(x * 997) * 0.1373 + Math.round(y * 997) * 0.2711 +
                       Math.round(z * 997) * 0.1619 + seed * 7.31) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  }

  /** Push vertices in or out from the origin by up to ±amt of their distance. */
  function lump(geo, amt, seed, keepBelow) {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (keepBelow !== undefined && y <= keepBelow) continue;
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

  /** Square (or, scaled in z, rectangular) frustum: halfTop / halfBot are half-widths. */
  function sqFrustum(halfTop, halfBot, h) {
    return new THREE.CylinderGeometry(halfTop * Math.SQRT2, halfBot * Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4);
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

  /** Reverse every triangle, so a single-sided sheet can be seen from its back. */
  function flip(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const P = g.attributes.position;
    for (let t = 0; t + 2 < P.count; t += 3) {
      const x = P.getX(t + 1), y = P.getY(t + 1), z = P.getZ(t + 1);
      P.setXYZ(t + 1, P.getX(t + 2), P.getY(t + 2), P.getZ(t + 2));
      P.setXYZ(t + 2, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  /** A double-sided copy of a sheet: leaves, fronds, sails, flags. */
  function twoSided(geo) {
    const back = flip(geo.clone());
    const front = geo.index ? geo.toNonIndexed() : geo;
    if (front !== geo) geo.dispose();
    const a = front.attributes.position.array, b = back.attributes.position.array;
    const pos = new Float32Array(a.length + b.length);
    pos.set(a, 0); pos.set(b, a.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    front.dispose(); back.dispose();
    return g;
  }

  /**
   * A curved leaf (or frond, petal, pennant-ish strip) growing along +X and
   * arching in the XY plane: it leaves the base at elevation a0 and bends down
   * by `curl` radians over its length. Width follows a sine bulge (o.shape:
   * lower = fuller), o.serr makes alternate rows jut out (fern leaflets) and
   * o.fold raises the midrib into a shallow tent. Single-sided; see twoSided.
   */
  function leafGeo(len, wid, o) {
    o = o || {};
    const n = o.n || 8, a0 = o.a0 === undefined ? 0.6 : o.a0, curl = o.curl === undefined ? 1.2 : o.curl, pw = o.pow || 1;
    const fold = o.fold === undefined ? 0.22 : o.fold, serr = o.serr || 0, shape = o.shape || 0.6;
    const base = o.base === undefined ? 0.08 : o.base;
    const rows = [];
    let x = 0, y = 0;
    const ds = len / n;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      let w = wid * Math.pow(Math.max(0, Math.sin(Math.PI * (base + (1 - base) * s))), shape);
      if (serr && (i % 2) && i < n) w *= 1 + serr;
      rows.push([x, y, w]);
      const phi = a0 - curl * Math.pow(s + 0.5 / n, pw);
      x += Math.cos(phi) * ds; y += Math.sin(phi) * ds;
    }
    const pos = [];
    const P = (r, k) => (k === 0 ? [r[0], r[1], r[2]] : k === 1 ? [r[0], r[1] + fold * r[2], 0] : [r[0], r[1], -r[2]]);
    const tri = (p, q, s) => { pos.push(p[0], p[1], p[2], q[0], q[1], q[2], s[0], s[1], s[2]); };
    for (let i = 0; i < n; i++) {
      const a = rows[i], b = rows[i + 1];
      tri(P(a, 0), P(b, 0), P(a, 1)); tri(P(a, 1), P(b, 0), P(b, 1));
      tri(P(a, 1), P(b, 1), P(a, 2)); tri(P(a, 2), P(b, 1), P(b, 2));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /** A buttress-root fin: a concave triangle standing on the ground along +X. */
  function finGeo(L, H, t) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(L, 0); sh.quadraticCurveTo(L * 0.18, H * 0.12, 0, H); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -t / 2);
  }

  /** An arc of a ring in the XY plane, centred on the bottom (smile) or top (happy eye / frown). */
  function arcGeo(R, tube, arc, top) {
    const g = new THREE.TorusGeometry(R, tube, 5, 12, arc);
    g.rotateZ((top ? HALF_PI : -HALF_PI) - arc / 2);
    return g;
  }

  /** A five-pointed zig-zag lightning bolt in the XY plane, `size` tall. */
  function boltGeo(size, depth) {
    const s = size, sh = new THREE.Shape();
    sh.moveTo(0.1 * s, 0.5 * s); sh.lineTo(-0.22 * s, 0.02 * s); sh.lineTo(0.0 * s, 0.04 * s);
    sh.lineTo(-0.14 * s, -0.5 * s); sh.lineTo(0.24 * s, 0.06 * s); sh.lineTo(0.02 * s, 0.04 * s);
    sh.lineTo(0.22 * s, 0.5 * s); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  }

  /** A tube along a list of points (CatmullRom), for smiles, roots and wind ribbons. */
  function tubeGeo(points, radius, segs, radial) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.TubeGeometry(curve, segs || 24, radius, radial || 5, false);
  }

  /* ── Shared materials and the falling-water texture ──────────────────── */
  /** Vertex-coloured Lambert with a DEEP emissive: flames, crystals, glowing windows. */
  const glowMat = (hex, k) => A.mat.lambertV({ emissive: hex, emissiveIntensity: k === undefined ? 1 : k });

  /** Pale streaky water, one shared texture: scrolling its offset makes every fall flow. */
  function waterTex() {
    return A.tex.cached('wonder-falls', () => A.tex.canvas(32, 128, (g, w, h) => {
      g.fillStyle = '#9fdcf4';
      g.fillRect(0, 0, w, h);
      let s = 1234567;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), len = 14 + Math.floor(rnd() * 40), wd = 1 + Math.floor(rnd() * 3);
        g.fillStyle = i % 3 ? '#f4fcff' : '#5fbde6';
        g.fillRect(x, y, wd, len);
        if (y + len > h) g.fillRect(x, y - h, wd, len);   // wrap so the tile repeats seamlessly
      }
    }, { repeat: true }));
  }
  function waterMat() {
    return A.mat.lambert(0xffffff, { map: waterTex(), emissive: 0x15394a, emissiveIntensity: 1 });
  }
  /** Shared anim: scroll the water texture by absolute time (idempotent for many callers). */
  function flowAnim(t) {
    const tx = waterTex();
    tx.offset.y = (t * 0.55) % 1;
  }
  /**
   * A falling ribbon of water: a strip of rows from `pts` (top to bottom, each
   * [x, y, z]) `w` wide across the horizontal direction `across` ([x, z]).
   * UVs repeat every 8 m down and 4 m across so streaks keep their size.
   */
  function waterRibbon(pts, w, across) {
    const pos = [], uv = [], idx = [];
    let v = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) v += dist(pts[i - 1], pts[i]) / 8;
      const p = pts[i], wi = Array.isArray(w) ? w[i] : w;
      for (let s = -1; s <= 1; s += 2) {
        pos.push(p[0] + across[0] * s * wi / 2, p[1], p[2] + across[1] * s * wi / 2);
        uv.push((s + 1) / 2 * wi / 4, -v);
      }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // Both faces must show: the camera can be on either side of a fall.
    const both = g.toNonIndexed();
    g.dispose();
    const P = both.attributes.position.array, T = both.attributes.uv.array;
    const P2 = new Float32Array(P.length * 2), T2 = new Float32Array(T.length * 2);
    P2.set(P); T2.set(T);
    for (let t = 0; t < P.length / 9; t++) {
      const o = P.length + t * 9, o2 = T.length + t * 6;
      for (const [d, s] of [[0, 0], [3, 6], [6, 3]]) {
        P2[o + d] = P[t * 9 + s]; P2[o + d + 1] = P[t * 9 + s + 1]; P2[o + d + 2] = P[t * 9 + s + 2];
      }
      for (const [d, s] of [[0, 0], [2, 4], [4, 2]]) { T2[o2 + d] = T[t * 6 + s]; T2[o2 + d + 1] = T[t * 6 + s + 1]; }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P2, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(T2, 2));
    out.computeVertexNormals();
    both.dispose();
    return out;
  }
  function addWater(k, geo) {
    const m = new THREE.Mesh(geo, waterMat());
    m.userData.noOutline = true;
    k.root.add(m);
    k.root.userData.hasWater = true;
    return m;
  }

  /* ── Kit: one prop under construction ────────────────────────────────── */
  function Kit(rng, toon) {
    this.rng = rng;
    this.mat = toon ? A.mat.toonV() : A.mat.lambertV();
    this.root = new THREE.Group();
  }
  /**
   * @param geo     a fresh geometry (consumed)
   * @param col     hex, face-colour function, or null when already painted
   * @param o       { s, r, p, order, jit, grad, y0, y1, noInk, mat }
   * @param parent  a node to hang the part on (default: the root)
   */
  Kit.prototype.add = function (geo, col, o, parent) {
    o = o || {};
    place(geo, o);
    const g = col === null ? geo : paintFaces(geo, col, this.rng, o);
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Mesh(g, o.mat || this.mat);
    if (o.noInk) m.userData.noOutline = true;
    (parent || this.root).add(m);
    return m;
  };

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
  /** Welded ink shells keep their outline flag, so tools can tell hull from body. */
  function flagInk(out) {
    out.traverse((m) => { if (m.isMesh && m.material && m.material.side === THREE.BackSide) m.userData.outline = true; });
    return out;
  }
  /** Sit the prop on its ground line (lowest point at `ground`) and weld it. */
  function finish(kit, ground) {
    shiftY(kit, (ground || 0) - bounds(kit.root).min.y);
    return flagInk(A.mergeByMaterial(kit.root));
  }
  /** Hanging dressing: the TOP is the origin, everything below it. */
  function finishTop(kit) {
    shiftY(kit, -bounds(kit.root).max.y);
    return A.mergeByMaterial(kit.root);
  }
  /** Sky props keep the origin they were built around and say they float. */
  function finishFloat(kit) {
    kit.root.userData.floats = true;
    return A.mergeByMaterial(kit.root);
  }

  /* ── Animation contract (identical to props-sunshine.js) ─────────────────
   * root.userData.anim = [{ node, type, axis, speed, amp, phase }]
   *   spin : node.rotation[axis] += speed * dt
   *   sway : node.rotation[axis] = rest + amp * sin(speed*t + phase)
   *   bob  : node.position[axis] = rest + amp * sin(speed*t + phase)
   * plus a non-enumerable update(t, dt). Props whose water flows add a
   * non-enumerable `extra(t, dt)` that update() also runs (texture scroll).
   */
  function driveAnim(t, dt) {
    for (let i = 0; i < this.length; i++) {
      const a = this[i], n = a.node;
      if (a.type === 'spin') { n.rotation[a.axis] += a.speed * (dt || 0); continue; }
      const obj = a.type === 'bob' ? n.position : n.rotation;
      if (a.rest === undefined) a.rest = obj[a.axis];
      obj[a.axis] = a.rest + a.amp * Math.sin(a.speed * t + a.phase);
    }
    if (this.extra) this.extra(t, dt);
  }
  function animList(kit) {
    const ud = kit.root.userData;
    if (!ud.anim) {
      ud.anim = [];
      Object.defineProperty(ud.anim, 'update', { value: driveAnim });
    }
    return ud.anim;
  }
  function anim(kit, node, type, axis, speed, amp, phase) {
    animList(kit).push({ node, type, axis, speed, amp: amp || 0, phase: phase || 0 });
  }
  /** Flowing water: scroll the shared texture from the prop's anim. */
  function flows(kit) {
    Object.defineProperty(animList(kit), 'extra', { value: flowAnim });
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
      if (an && !obj.userData.idle) obj.userData.idle = (t, dt) => an.update(t, dt || 0);
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
   * Centre a roller's baked parts on its rolling axis and size it to 2R across,
   * so spinning about the bounds centre (world.js) or rollNode never wobbles.
   */
  function centreBall(node, R) {
    const b = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3();
    node.children.forEach((m) => {
      if (!m.isMesh || m.userData.outline) return;
      m.geometry.computeBoundingBox();
      b.union(m.geometry.boundingBox);
    });
    b.getCenter(c); b.getSize(size);
    const s = 2 * R / Math.max(size.x, size.y);
    node.children.forEach((m) => { if (m.isMesh) m.geometry.translate(-c.x, -c.y, 0).scale(s, s, s); });
  }

  /**
   * A bamboo cane along +Y (centred), its rows paired so every joint is a thin
   * band `band` metres tall at each multiple of the returned `seg`.
   */
  function bambooGeo(rad, H, seg, band) {
    const nodes = Math.max(1, Math.round(H / seg)), s = H / nodes;
    const g = new THREE.CylinderGeometry(rad, rad * 1.08, H, 5, nodes * 2, true);
    const P = g.attributes.position;
    for (let v = 0; v < P.count; v++) {
      const row = Math.round((P.getY(v) + H / 2) / (H / (nodes * 2)));
      const j = Math.floor(row / 2), y = j * s + (row % 2 ? band : 0);
      P.setY(v, Math.min(H, y) - H / 2);
    }
    g.computeVertexNormals();
    return { g, seg: s };
  }

  /* ── Small shared pieces ──────────────────────────────────────────────── */
  const INK = 0x1f1b2e;
  const WHITE = 0xffffff;
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d === undefined ? 1 : d);

  /** A friendly eye: white, pupil and glint, looking along dz (+1 or -1 in Z). */
  function eye(k, x, y, z, s, dz, o) {
    o = o || {};
    k.add(ico(1, 1), o.white || WHITE, { s: [s * 0.78, s, s * 0.42], p: [x, y, z] }, o.parent);
    const lx = (o.look || 0) * s * 0.22;
    k.add(ico(1, 1), o.pupil || INK, { s: [s * 0.46, s * 0.56, s * 0.3], p: [x + lx, y - s * 0.1, z + dz * s * 0.22], noInk: true }, o.parent);
    k.add(ico(1, 0), WHITE, { s: [s * 0.15, s * 0.15, s * 0.1], p: [x + lx + s * 0.13, y + s * 0.08, z + dz * s * 0.47], noInk: true }, o.parent);
  }

  /** A lumpy leaf/cloud ball, flattened by `sq`, lighter on top. */
  function lobe(k, x, y, z, R, col, sq, lite, parent) {
    const g = lump(lite ? new THREE.DodecahedronGeometry(1, 0) : ico(1, 1), lite ? 0.1 : 0.12, k.rng.next() * 99);
    return k.add(g, col, { s: [R, R * (sq || 0.7), R], p: [x, y, z], jit: 0.07, grad: 0.45 }, parent);
  }

  /** A cloud ball: smooth-ish sphere, white on top, a cool tint underneath. */
  function puff(k, x, y, z, R, sq, cols, segs, parent) {
    const base = y - R * (sq || 1) * 0.15;
    const sh = cols[1];
    return k.add(new THREE.SphereGeometry(1, segs || 11, segs ? Math.max(5, segs - 4) : 7), (cx, cy) => (cy < base ? sh : cols[0]),
      { s: [R, R * (sq || 1), R], p: [x, y, z], jit: 0.02, grad: 0.12 }, parent);
  }

  /* ════════════════════════════════════════════════════════════════════════
   * JUNGLE FALLS — warm humid greens, tropical flowers, mossy stone, gold
   * ════════════════════════════════════════════════════════════════════════ */
  const LEAF = [0x2f9e44, 0x3aae4a, 0x2a8f3e, 0x46b83f, 0x24803a];
  const BARK = [0x7a5638, 0x6b4a30, 0x86603f];
  const MOSS = [0x6fae3c, 0x5ea236, 0x84bd45];
  const STONE = [0x9aa290, 0x8a9480, 0xa6ad9b];
  const GOLD = 0xf5b82e;
  const PETAL = [0xff4f86, 0xff8a1f, 0xffd23f, 0xe8384f, 0xc15cff];
  const VINE = 0x3f8f2f;

  /** A hanging vine of a few slack segments with leaves, sometimes a flower. */
  function vine(k, x, y, z, len, sc) {
    const r = k.rng;
    let p = [x, y, z];
    const segs = 3;
    for (let i = 0; i < segs; i++) {
      const q = [p[0] + r.range(-0.3, 0.3) * sc, p[1] - len / segs, p[2] + r.range(-0.3, 0.3) * sc];
      k.add(rod(p, q, 0.07 * sc, 0.06 * sc, 4), VINE);
      k.add(new THREE.OctahedronGeometry(0.26 * sc, 0), pick(LEAF, r, 0.05),
        { s: [1.5, 0.45, 0.8], r: [0, r.range(0, TAU), r.range(-0.4, 0.4)], p: [q[0], q[1] + len / segs * 0.4, q[2]] });
      p = q;
    }
    if (r.chance(0.45)) k.add(ico(0.22 * sc, 0), r.pick(PETAL), { p: p });
  }

  /** A hibiscus: five fanned petals, a dark heart and a long stamen. */
  function hibiscus(k, x, y, z, sc, col, tilt, yaw) {
    const r = k.rng, heart = shade(col, -0.25), edge = shade(col, 0.08);
    // Five rounded petals rise from a deep heart and flare out at the tips: a trumpet.
    for (let i = 0; i < 5; i++) {
      const g = paintFaces(twoSided(leafGeo(0.52 * sc, 0.22 * sc, { n: 5, a0: 1.05, curl: 1.05, fold: -0.25, shape: 0.55, base: 0.04 })),
        (cx) => (cx < 0.12 * sc ? heart : cx > 0.3 * sc ? edge : col), r, { jit: 0.04 });
      k.add(g, null, { r: [0, i / 5 * TAU + yaw, 0], order: 'YZX', p: [x, y, z] });
    }
    k.add(rod([x, y, z], [x + Math.sin(tilt) * 0.1 * sc, y + 0.42 * sc, z], 0.03 * sc, 0.02 * sc, 4), 0xffe08a);
    k.add(ico(0.06 * sc, 0), 0xffd23f, { p: [x + Math.sin(tilt) * 0.1 * sc, y + 0.44 * sc, z] });
  }

  /** A bird of paradise: a green-pink beak with an orange crest and a blue tongue. */
  function birdOfParadise(k, x, y, z, sc, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, v) => [x + c * u, y + v, z - s * u];
    k.add(new THREE.ConeGeometry(0.09 * sc, 0.65 * sc, 6), (cx, cy) => (cy < y ? 0x3d9a52 : 0xd8517a),
      { r: [0, yaw, -HALF_PI - 0.12], order: 'YZX', p: at(0.28 * sc, 0) });
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.ConeGeometry(0.06 * sc, 0.5 * sc, 4), i === 1 ? 0xffa21f : 0xff7f11,
        { r: [0, yaw, -0.3 - i * 0.32], order: 'YZX', p: at(0.08 * sc + i * 0.05 * sc, 0.2 * sc) });
    }
    k.add(new THREE.ConeGeometry(0.05 * sc, 0.32 * sc, 4), 0x3f63d8, { r: [0, yaw, -0.9], order: 'YZX', p: at(0.22 * sc, 0.13 * sc) });
  }

  /** A buttressed rainforest tree: curved trunk, fins, lobed canopy, vines. */
  function jungleTree(k, x0, y0, z0, sc, lite) {
    const r = k.rng, H = r.range(10.5, 13) * sc, bark = pick(BARK, r, 0.03);
    const T = H * 0.6, bx = r.range(0.5, 1.2) * sc * r.sign(), bz = r.range(-0.6, 0.6) * sc;
    const at = (s) => [x0 + bx * s * s, y0 + T * s, z0 + bz * s * s];
    const n = lite ? 3 : 4;
    for (let i = 0; i < n; i++) {
      k.add(rod(at(i / n), at(Math.min(1.04, (i + 1) / n + 0.03)), (0.62 - 0.3 * i / n) * sc, (0.62 - 0.3 * (i + 1) / n) * sc, 6), bark, { jit: 0.05 });
    }
    const nf = lite ? 3 : 5, f0 = r.range(0, TAU);
    for (let i = 0; i < nf; i++) {
      const a = f0 + i / nf * TAU + r.range(-0.25, 0.25);
      k.add(finGeo(r.range(1.5, 2.2) * sc, r.range(1.8, 2.6) * sc, 0.22 * sc), shade(bark, -0.05), { r: [0, -a, 0], p: [x0, y0, z0], jit: 0.04 });
    }
    const top = at(1), cx = top[0], cy = top[1] + 0.9 * sc, cz = top[2];
    const R = 2.9 * sc, la = pick(LEAF, r, 0.04), lb = pick(LEAF, r, 0.04);
    lobe(k, cx, cy, cz, R, la, 0.62, lite);
    const nl = lite ? 3 : 5, b0 = r.range(0, TAU);
    for (let i = 0; i < nl; i++) {
      const a = b0 + i / nl * TAU + r.range(-0.3, 0.3), d = R * r.range(0.95, 1.15), rr = R * r.range(0.62, 0.78);
      const px = cx + Math.cos(a) * d, py = cy + r.range(-0.9, 0.2) * sc, pz = cz + Math.sin(a) * d;
      lobe(k, px, py, pz, rr, i % 2 ? la : lb, 0.6, lite);
      if (!lite && i < 3) k.add(rod([cx, cy - 1.3 * sc, cz], [cx + (px - cx) * 0.75, py - rr * 0.3, cz + (pz - cz) * 0.75], 0.24 * sc, 0.13 * sc, 5), bark);
      if (!lite && i % 2 === 0) vine(k, px + Math.cos(a) * rr * 0.45, py - rr * 0.35, pz + Math.sin(a) * rr * 0.45, r.range(2.4, 4.4) * sc, sc);
    }
    lobe(k, cx + r.range(-0.6, 0.6) * sc, cy + 1.9 * sc, cz + r.range(-0.6, 0.6) * sc, R * 0.7, shade(la, 0.05), 0.68, lite);
    if (!lite && r.chance(0.5)) {
      const fc = r.pick(PETAL);
      for (let i = 0; i < 6; i++) {
        const a = r.range(0, TAU), up = r.range(0.2, 0.8);
        k.add(ico(0.26 * sc, 0), fc, { p: [cx + Math.cos(a) * R * 1.05 * Math.sqrt(1 - up * up) * 1.2, cy + up * R * 0.65, cz + Math.sin(a) * R * 1.05 * Math.sqrt(1 - up * up) * 1.2] });
      }
    }
  }
  prop('jungle_tree', (r) => { const k = new Kit(r); jungleTree(k, 0, 0, 0, r.range(0.92, 1.08), false); return finish(k); });

  /** A spray of arching serrated fronds with a couple of curled fiddleheads. */
  prop('giant_fern', (r) => {
    const k = new Kit(r), n = r.int(6, 9), a0 = r.range(0, TAU), sc = r.range(0.9, 1.1);
    const dark = pick([0x23803a, 0x2a8a3c], r, 0.03), light = pick([0x6cc84a, 0x5fbf45], r, 0.03);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r.range(-0.2, 0.2), upright = i % 3 === 0;
      // Fronds shoot up and only arch over near their tips (pow > 1 bends late).
      const len = (upright ? r.range(3.0, 3.3) : r.range(2.4, 2.7)) * sc;
      const g = paintFaces(twoSided(leafGeo(len, 0.32 * sc, { n: 12, a0: upright ? 1.5 : r.range(1.4, 1.48), curl: upright ? 3.2 : r.range(2.5, 2.8), pow: upright ? 2.5 : 2, fold: 0.15, serr: 0.75, shape: 0.5 })),
        (cx) => mixHex(dark, light, cx / (len * 0.7)), r, { jit: 0.05 });
      k.add(g, null, { r: [r.range(-0.25, 0.25), a, 0], order: 'YZX', p: [Math.cos(a) * 0.12, 0.05, -Math.sin(a) * 0.12] });
    }
    for (let i = 0; i < 2; i++) {
      const x = (i - 0.5) * 0.3;
      k.add(rod([x, 0, 0], [x, 0.75 * sc, 0.05], 0.035, 0.03, 4), dark);
      k.add(new THREE.TorusGeometry(0.11 * sc, 0.035 * sc, 4, 8, Math.PI * 1.5), light, { p: [x, 0.84 * sc, 0.05], r: [0, HALF_PI, 0] });
    }
    return finish(k);
  });

  /** Two or three big tropical flowers on leafy stems. */
  prop('jungle_flower', (r) => {
    const k = new Kit(r), n = r.int(2, 3), stem = 0x3f9a3c;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + r.range(-0.3, 0.3);
      const g = paintFaces(twoSided(leafGeo(r.range(0.8, 1.0), 0.26, { n: 5, a0: r.range(0.9, 1.2), curl: 1.6, fold: 0.2, shape: 0.5 })),
        (cx) => mixHex(0x2a8a3c, 0x55b845, cx), r, { jit: 0.04 });
      k.add(g, null, { r: [0, a, 0], order: 'YZX', p: [0, 0.02, 0] });
    }
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU) + i * 2.1, d = 0.25 + i * 0.12, h = r.range(1.3, 1.85);
      const base = [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], mid = [Math.cos(a) * d * 0.5, h * 0.5, Math.sin(a) * d * 0.5];
      const tip = [Math.cos(a) * d, h, Math.sin(a) * d];
      k.add(rod(base, mid, 0.05, 0.045, 5), stem);
      k.add(rod(mid, tip, 0.045, 0.035, 5), stem);
      const g = paintFaces(twoSided(leafGeo(0.55, 0.16, { n: 4, a0: 0.7, curl: 1.4, fold: 0.2 })), 0x46a83f, r, { jit: 0.04 });
      k.add(g, null, { r: [0, a + 1.2, 0], order: 'YZX', p: mid });
      if (r.chance(0.6)) hibiscus(k, tip[0], tip[1], tip[2], r.range(1.05, 1.3), r.pick([0xff4f86, 0xe8384f, 0xff8a1f, 0xffc93a]), r.range(0.15, 0.4), r.range(0, TAU));
      else birdOfParadise(k, tip[0], tip[1], tip[2], r.range(1.1, 1.4), r.range(0, TAU));
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A banana plant: striped pseudo-stem, broad paddle leaves and a hanging bunch. */
  prop('banana_plant', (r) => {
    const k = new Kit(r), sc = r.range(0.9, 1.1), H = 2.5 * sc;
    const stemC = pick([0x7f9e3e, 0x86a447], r, 0.03);
    k.add(new THREE.CylinderGeometry(0.2 * sc, 0.32 * sc, H, 7, 3), (cx, cy, cz) => (hash3(Math.round(Math.atan2(cz, cx) * 3), Math.round(cy * 2), 0, 3) > 0.3 ? shade(stemC, -0.1) : stemC),
      { p: [0, H / 2, 0], jit: 0.04 });
    const n = r.int(6, 8), a0 = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r.range(-0.2, 0.2), len = r.range(2.3, 2.9) * sc, w = r.range(0.5, 0.65) * sc;
      const torn = r.chance(0.35), lc = pick([0x4cb33a, 0x5cbf3e, 0x3fa53a], r, 0.03);
      const g = paintFaces(twoSided(leafGeo(len, w, { n: 9, a0: r.range(1.0, 1.35), curl: r.range(1.9, 2.5), fold: 0.12, shape: 0.32, base: 0.04, serr: torn ? 0.18 : 0 })),
        (cx, cy, cz) => (Math.abs(cz) < w * 0.22 ? shade(lc, 0.12) : lc), r, { jit: 0.04 });
      k.add(g, null, { r: [r.range(-0.2, 0.2), a, 0], order: 'YZX', p: [0, H - 0.05, 0] });
    }
    k.add(new THREE.ConeGeometry(0.12 * sc, 1.0 * sc, 5), 0x7fd05a, { p: [0, H + 0.45 * sc, 0] });
    // The bunch hangs from a stalk that arcs out of the crown.
    const ba = r.range(0, TAU), bc = Math.cos(ba), bs = Math.sin(ba);
    const s0 = [0, H - 0.1, 0], s1 = [bc * 0.55 * sc, H + 0.05, bs * 0.55 * sc], s2 = [bc * 0.75 * sc, H - 0.95 * sc, bs * 0.75 * sc];
    k.add(rod(s0, s1, 0.06, 0.055, 5), 0x6e8f3a);
    k.add(rod(s1, s2, 0.055, 0.05, 5), 0x6e8f3a);
    for (let h = 0; h < 3; h++) {
      const y = H - 0.3 * sc - h * 0.24 * sc, t = (H + 0.05 - y) / (H + 0.05 - s2[1]);
      const cx = s1[0] + (s2[0] - s1[0]) * t, cz = s1[2] + (s2[2] - s1[2]) * t;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + h * 0.5;
        k.add(ico(1, 0), (cx2, cy2) => (cy2 > y + 0.17 * sc ? 0x8cbf3a : 0xffd84a),
          { s: [0.065 * sc, 0.24 * sc, 0.065 * sc], r: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55], p: [cx + Math.cos(a) * 0.14 * sc, y + 0.12 * sc, cz + Math.sin(a) * 0.14 * sc] });
      }
    }
    k.add(new THREE.ConeGeometry(0.13 * sc, 0.4 * sc, 6), 0xa3264a, { r: [Math.PI, 0, 0], p: [s2[0], s2[1] - 0.12 * sc, s2[2]] });
    return finish(k);
  });

  /** Mossy boulders: grey-green stone with moss caps and a sprig or two. */
  prop('mossy_rock', (r) => {
    const k = new Kit(r), n = r.int(1, 3), seed = r.next() * 99;
    let mainR = 1;
    for (let i = 0; i < n; i++) {
      const R = i ? r.range(0.45, 0.65) : r.range(0.85, 1.05), sx = r.range(1.1, 1.35), sy = r.range(0.75, 0.95);
      if (!i) mainR = R;
      const x = i ? (i === 1 ? 1 : -1) * r.range(1.0, 1.3) : 0, z = i ? r.range(-0.5, 0.5) : 0, y = R * sy * 0.55;
      const stone = pick(STONE, r, 0.03), moss = pick(MOSS, r, 0.03);
      k.add(lump(ico(1, 1), 0.16, seed + i), (cx, cy, cz) => {
        const h = (cy - y) / (R * sy) + 0.25 * hash3(Math.round(cx * 2), 0, Math.round(cz * 2), seed);
        return h > 0.15 ? moss : stone;
      }, { s: [R * sx, R * sy, R], r: [0, r.range(0, TAU), 0], p: [x, y, z], jit: 0.06, grad: 0.2 });
    }
    const sprigs = r.int(1, 2);
    for (let i = 0; i < sprigs; i++) {
      const a = r.range(0, TAU);
      const g = paintFaces(twoSided(leafGeo(0.5, 0.12, { n: 4, a0: 1.1, curl: 1.6, serr: 0.6, fold: 0.1 })), 0x4fb341, r, { jit: 0.05 });
      k.add(g, null, { r: [0, a, 0], order: 'YZX', p: [r.range(-0.3, 0.3), 0.95 * 0.85, r.range(-0.3, 0.3)] });
    }
    if (r.chance(0.6)) {
      // A pair of orange toadstools nestled against the front of the main stone.
      for (let i = 0; i < 2; i++) {
        const x = (i ? 0.25 : -0.05) + r.range(-0.1, 0.1), z = -(mainR * 0.92 + 0.12 + i * 0.1), h = i ? 0.16 : 0.24;
        k.add(new THREE.CylinderGeometry(0.03, 0.045, h, 5), 0xf3e6d0, { p: [x, h / 2, z] });
        k.add(new THREE.SphereGeometry(i ? 0.1 : 0.14, 8, 3, 0, TAU, 0, HALF_PI), 0xff8a1f, { s: [1, 0.8, 1], p: [x, h - 0.02, z] });
      }
    }
    return finish(k);
  });

  /** A bamboo tiki torch: ringed pole, twine, a coconut bowl and a flickering flame. */
  prop('tiki_torch', (r) => {
    const k = new Kit(r), H = r.range(1.75, 1.95), bam = pick([0xc9a35a, 0xbf9850], r, 0.03), knot = shade(bam, -0.2);
    const cane = bambooGeo(0.08, H, 0.55, 0.06);
    k.add(cane.g, (cx, cy) => ((cy % cane.seg) < 0.06 ? knot : bam), { p: [0, H / 2, 0], jit: 0.04 });
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + r.range(0, 1);
      k.add(lump(new THREE.DodecahedronGeometry(0.16, 0), 0.1, i), pick(STONE, r, 0.04), { s: [1.2, 0.7, 1], p: [Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2] });
    }
    k.add(new THREE.CylinderGeometry(0.24, 0.12, 0.3, 8), 0x6b4428, { p: [0, H + 0.12, 0], jit: 0.05 });
    k.add(new THREE.TorusGeometry(0.24, 0.035, 4, 10), 0x3d2615, { r: [HALF_PI, 0, 0], p: [0, H + 0.27, 0] });
    [H - 0.12, H - 0.22].forEach((y) => k.add(new THREE.TorusGeometry(0.095, 0.025, 4, 8), 0xe8d29a, { r: [HALF_PI, 0, 0], p: [0, y, 0] }));
    const node = new THREE.Group();
    node.position.set(0, H + 0.26, 0);
    const fm = glowMat(0x5a2200, 1);
    k.add(ico(0.2, 1), 0xff7a12, { s: [1, 0.9, 1], p: [0, 0.12, 0], mat: fm }, node);
    k.add(new THREE.ConeGeometry(0.17, 0.62, 7), 0xff9a1c, { p: [0.02, 0.45, 0], r: [0, 0, -0.1], mat: fm }, node);
    k.add(new THREE.ConeGeometry(0.1, 0.42, 6), 0xffd23f, { p: [-0.02, 0.36, -0.05], r: [0, 0, 0.12], mat: fm }, node);
    const flame = keep(node);
    k.root.add(flame);
    anim(k, flame, 'sway', 'z', 7.3, 0.12, r.range(0, TAU));
    anim(k, flame, 'sway', 'x', 5.1, 0.1, r.range(0, TAU));
    anim(k, flame, 'bob', 'y', 9.7, 0.025, r.range(0, TAU));
    return finish(k);
  });

  /** A clump of ringed bamboo stalks with leaf tufts near their tops. */
  prop('bamboo_clump', (r) => {
    const k = new Kit(r), n = r.int(5, 7), green = pick([0x8fbf3a, 0x7fb23c, 0x9cc84a], r, 0.03), knot = shade(green, -0.2);
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), d = i ? r.range(0.3, 0.85) : 0;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, H = (i === 0 ? 6 : r.range(3.4, 5.8)), rad = r.range(0.07, 0.11);
      const cane = bambooGeo(rad, H, 0.75, 0.07), seg = cane.seg;
      // Lean away from the clump's middle; the cane tilts about its own centre.
      const lx = r.range(-0.06, 0.06) + x * 0.08, lz = r.range(-0.06, 0.06) + z * 0.08;
      k.add(cane.g, (cx, cy) => ((cy % seg) < 0.07 ? knot : green), { r: [lz, 0, -lx], p: [x, H / 2, z], jit: 0.03 });
      const tufts = H > 4.5 ? 2 : 1;
      for (let t = 0; t < tufts; t++) {
        const ty = H - 0.3 - t * 1.4, off = ty - H / 2;
        for (let l = 0; l < 3; l++) {
          const la = r.range(0, TAU);
          const lg = paintFaces(twoSided(leafGeo(r.range(0.6, 0.85), 0.1, { n: 2, a0: 0.3, curl: 0.9, fold: 0, shape: 0.8 })), pick(LEAF, r, 0.05), r, {});
          k.add(lg, null, { r: [0, la, 0], order: 'YZX', p: [x + Math.sin(lx) * off, ty, z + Math.sin(lz) * off] });
        }
      }
    }
    return finish(k);
  });

  /* ── Jungle far ─────────────────────────────────────────────────────── */

  /** A steep karst hill wrapped in a lumpy broccoli canopy, with rock showing through. */
  prop('jungle_hill', (r) => {
    const k = new Kit(r), R = r.range(30, 55), H = r.range(30, 48), Rz = R * r.range(0.75, 0.95), seed = r.next() * 99;
    const prof = [[0, 1], [0.2, 0.985], [0.42, 0.92], [0.62, 0.78], [0.78, 0.58], [0.89, 0.36], [0.96, 0.16], [1, 0]];
    const g = lump(new THREE.LatheGeometry(prof.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y)), 14), 0.05, seed, 0.001);
    const rock = pick([0x8d8f78, 0x7f8670], r, 0.03), jungle = pick([0x2f8f3e, 0x2a8538], r, 0.03);
    k.add(g, (cx, cy, cz) => {
      const h = cy / H, n = hash3(Math.round(cx / 9), Math.round(cy / 7), Math.round(cz / 9), seed);
      if (h > 0.25 && h < 0.7 && n > 0.62) return rock;
      return h < 0.12 ? shade(jungle, -0.06) : jungle;
    }, { s: [R, H, Rz], jit: 0.06, grad: 0.3 });
    const radAt = (h) => {
      for (let i = prof.length - 1; i > 0; i--) {
        const a = prof[i], b = prof[i - 1];
        if (h <= b[1]) return a[0] + (b[0] - a[0]) * (h - a[1]) / ((b[1] - a[1]) || 1);
      }
      return 0;
    };
    // Tree crowns in rings round the hill (jittered so they never line up), so
    // the canopy reads as one lumpy blanket rather than scattered bushes.
    const flowerTrees = r.int(2, 3), rings = [[0.97, 3], [0.84, 6], [0.66, 9], [0.45, 11], [0.24, 9]];
    let count = 0;
    rings.forEach(([h, m]) => {
      const a0 = r.range(0, TAU);
      for (let i = 0; i < m; i++) {
        const a = a0 + (i + r.range(-0.3, 0.3)) / m * TAU, hh = U.clamp(h + r.range(-0.05, 0.05), 0.1, 0.99);
        const rad = radAt(hh) * 0.9, br = (R * 0.15 + H * 0.07) * r.range(0.8, 1.15) * (h > 0.9 ? 1.2 : 1);
        const col = (count++ % 13 === 5 && count < 13 * flowerTrees) ? r.pick([0xff7ab0, 0xffb02e, 0xffd23f]) : pick(LEAF, r, 0.05);
        lobe(k, Math.cos(a) * rad * R, hh * H, Math.sin(a) * rad * Rz, br, col, 0.58, false);
      }
    });
    k.root.userData.embed = true;
    return finish(k);
  });

  /** A kapok giant: pale buttressed trunk, an umbrella of branches and a flat-topped canopy. */
  prop('giant_tree', (r) => {
    const k = new Kit(r), T = r.range(19.5, 22), bark = pick([0xa5967f, 0x9b8b74, 0xae9f88], r, 0.03), seed = r.next() * 99;
    const pts = [];
    for (let i = 0; i <= 5; i++) pts.push([Math.sin(i * 1.3 + seed) * 0.35, T * i / 5, Math.cos(i * 1.1 + seed) * 0.35]);
    for (let i = 0; i < 5; i++) k.add(rod(pts[i], [pts[i + 1][0], pts[i + 1][1] + 0.5, pts[i + 1][2]], 1.9 - i * 0.18, 1.72 - i * 0.18, 8), bark, { jit: 0.05 });
    const nf = 6, f0 = r.range(0, TAU);
    for (let i = 0; i < nf; i++) {
      const a = f0 + i / nf * TAU + r.range(-0.2, 0.2);
      k.add(finGeo(r.range(4.2, 5.8), r.range(5.5, 8), 0.5), shade(bark, -0.05), { r: [0, -a, 0], jit: 0.04 });
    }
    const la = pick(LEAF, r, 0.04), lb = pick(LEAF, r, 0.04), nb = 6, b0 = r.range(0, TAU);
    for (let i = 0; i < nb; i++) {
      const a = b0 + i / nb * TAU + r.range(-0.25, 0.25), d = r.range(6.6, 8), y0 = T - r.range(0, 2.5), y1 = T + r.range(2.5, 4.5);
      const mid = [Math.cos(a) * d * 0.55, (y0 + y1) / 2 - 0.5, Math.sin(a) * d * 0.55], end = [Math.cos(a) * d, y1, Math.sin(a) * d];
      k.add(rod([0, y0, 0], mid, 0.75, 0.5, 6), bark);
      k.add(rod(mid, end, 0.5, 0.28, 5), bark);
      lobe(k, end[0], end[1] + 1.2, end[2], r.range(4.4, 5.2), i % 2 ? la : lb, 0.5, false);
      lobe(k, end[0] * 0.62 + Math.cos(a + 0.5) * 2, end[1] + 2.2, end[2] * 0.62 + Math.sin(a + 0.5) * 2, r.range(3.6, 4.4), i % 2 ? lb : la, 0.55, true);
      if (i % 2 === 0) vine(k, mid[0], mid[1] - 0.3, mid[2], r.range(6, 10), 2.2);
      if (i % 3 === 1) {
        for (let j = 0; j < 4; j++) {
          k.add(new THREE.ConeGeometry(0.22, 1.0, 4), j % 2 ? 0xe8384f : 0xff6f91, { r: [Math.cos(j * HALF_PI) * 0.5, 0, Math.sin(j * HALF_PI) * 0.5], p: [mid[0], mid[1] + 0.9, mid[2]] });
        }
      }
    }
    lobe(k, 0, T + 5.4, 0, 5.8, shade(la, 0.04), 0.5, false);
    for (let i = 0; i < 3; i++) {
      const a = b0 + (i + 0.5) / 3 * TAU;
      lobe(k, Math.cos(a) * 4, T + 4.6, Math.sin(a) * 4, 4.8, i % 2 ? lb : la, 0.5, false);
    }
    return finish(k);
  });

  const stoneBlocks = (cols, seed, moss, topY) => (x, y, z) => {
    if (moss !== undefined && y > topY - 0.1 && hash3(Math.floor(x / 2.5), 0, Math.floor(z / 2.5), seed) > -0.4) return moss;
    const row = Math.floor(y / 1.25), h = hash3(Math.floor(x / 2.2 + (row % 2) * 0.5), row, Math.floor(z / 2.2), seed);
    return cols[h > 0.4 ? 0 : h > -0.4 ? 1 : 2];
  };

  /** A small overgrown stepped temple with a broken shrine, vines and fallen blocks. */
  prop('temple_ruin', (r) => {
    const k = new Kit(r), seed = r.next() * 99, stone = [0x9ba590, 0x8b9681, 0xa9b19e], moss = pick(MOSS, r, 0.03);
    const tiers = 4, th = 2.8, hw = [12.5, 10, 7.6, 5.4];
    for (let i = 0; i < tiers; i++) {
      const y = i * th, top = hw[i] - 0.8;
      k.add(sqFrustum(top, hw[i], th), stoneBlocks(stone, seed + i, moss, y + th), { s: [1, 1, 0.9], p: [0, y + th / 2, 0], jit: 0.05 });
    }
    // Front stairs up the -Z face.
    const steps = 11, yTop = tiers * th, z0 = -hw[0] * 0.9, z1 = -(hw[tiers - 1] - 0.8) * 0.9;
    for (let j = 0; j < steps; j++) {
      const y = (j + 0.5) * yTop / steps, z = z0 + (z1 - z0) * (j / steps) - 0.25;
      k.add(new THREE.BoxGeometry(3.6, yTop / steps, 2.4), j % 2 ? 0xc9c6aa : 0xbdbb9e, { p: [0, y, z + 1.2], jit: 0.05, r: [0, 0, r.chance(0.2) ? r.range(-0.05, 0.05) : 0] });
    }
    [-1, 1].forEach((s) => k.add(bar([s * 2.2, 0.5, z0 - 0.5], [s * 2.2, yTop + 0.4, z1 - 0.3], 0.8, 0.9), stone[1], { jit: 0.05 }));
    // Shrine: the roof has slumped, the doorway is dark, a faded gold sun keeps watch.
    k.add(new THREE.BoxGeometry(6.4, 4, 5), stoneBlocks(stone, seed + 9), { p: [0, yTop + 2, 0.4], jit: 0.05 });
    k.add(new THREE.BoxGeometry(2, 2.8, 0.3), 0x2b2a22, { p: [0, yTop + 1.4, -2.05] });
    k.add(new THREE.BoxGeometry(7, 0.7, 5.8), stone[2], { p: [0.4, yTop + 4.3, 0.4], r: [0.05, 0, r.sign() * 0.09], jit: 0.05 });
    k.add(new THREE.CylinderGeometry(0.75, 0.75, 0.25, 12), 0xd6a43a, { r: [HALF_PI, 0, 0], p: [0, yTop + 3.3, -2.15] });
    // Fallen blocks and cracks.
    for (let i = 0; i < 6; i++) {
      const a = r.range(0, TAU), d = r.range(11, 15);
      k.add(new THREE.BoxGeometry(r.range(1.2, 2.2), r.range(0.8, 1.3), r.range(1, 1.8)), r.pick(stone),
        { r: [r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.3, 0.3)], p: [Math.cos(a) * d, 0.4, Math.sin(a) * d * 0.9], jit: 0.06 });
    }
    // Overgrowth: bushes on the corners, vines down the faces, a tree on top.
    for (let i = 0; i < tiers; i++) {
      for (let c = 0; c < 4; c++) {
        if (!r.chance(0.55)) continue;
        const sx = c & 1 ? 1 : -1, sz = c & 2 ? 1 : -1, w = hw[i] - 1.1;
        lobe(k, sx * w, (i + 1) * th + 0.2, sz * w * 0.9, r.range(1.2, 2), pick(LEAF, r, 0.05), 0.65, true);
      }
      for (let v = 0; v < 2; v++) {
        const x = r.sign() * r.range(3.2, hw[i] - 2);
        vine(k, x, (i + 1) * th, -(hw[i] - 0.8) * 0.9 - 0.15, r.range(1.6, th * 1.2), 1.2);
      }
    }
    jungleTree(k, r.range(-1.5, 1.5), yTop, 2.0, 0.6, true);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A layered mossy cliff with a waterfall pouring into a rocky pool. */
  prop('waterfall_cliff', (r) => {
    const k = new Kit(r), W = r.range(28, 32), H = r.range(36, 42), D = 14, seed = r.next() * 99;
    const rockA = pick([0x8a8f7a, 0x7d8670], r, 0.03), rockB = shade(rockA, 0.06), moss = pick(MOSS, r, 0.03);
    const strata = (cx, cy, cz) => {
      if (hash3(Math.round(cx / 4), Math.round(cy / 3), Math.round(cz / 4), seed) > 0.55) return moss;
      return Math.floor(cy / 3.2) % 2 ? rockA : rockB;
    };
    const layers = [[W, H * 0.42, D, 0, 0], [W * 0.9, H * 0.34, D * 0.9, H * 0.4, 0.6], [W * 0.78, H * 0.28, D * 0.8, H * 0.72, 1.2]];
    layers.forEach(([w, h, d, y, zb], i) => {
      const g = lump(new THREE.BoxGeometry(1, 1, 1, 6, 6, 3), 0.07, seed + i, -0.49);
      k.add(g, strata, { s: [w, h, d], p: [0, y + h / 2, zb], jit: 0.05 });
      k.add(new THREE.BoxGeometry(w * 1.02, 0.6, d * 0.95), moss, { p: [0, y + h - 0.1, zb], jit: 0.06 });
    });
    for (let i = 0; i < 10; i++) {
      const x = (i / 9 - 0.5) * W * 0.8 + r.range(-1, 1), z = r.range(-1, 4);
      if (Math.abs(x) < 5.5) continue;                 // leave the river's notch clear
      lobe(k, x, H + 0.5, z + 1.2, r.range(3, 4.5), pick(LEAF, r, 0.05), 0.6, false);
    }
    [-1, 1].forEach((s) => {
      lobe(k, s * W * 0.42, 3, -D * 0.2, r.range(3.6, 4.6), rockB, 0.75, true);
      lobe(k, s * W * 0.4, 7, -D * 0.45, r.range(2.5, 3.2), pick(LEAF, r, 0.05), 0.7, true);
      lobe(k, s * r.range(5.5, 7), H + 0.8, r.range(2, 4), r.range(2.6, 3.4), pick(LEAF, r, 0.05), 0.65, false);
    });
    // The river runs in a stone channel on top, pours off the top ledge and
    // falls past the lower ledges (each further out) into the pool.
    const zTop = 1.2 - D * 0.8 / 2, pool = 1.5, zPool = -D / 2 - 5.5;
    k.add(new THREE.BoxGeometry(8.4, 1.6, 6), rockA, { p: [0, H + 0.1, zTop + 3], jit: 0.05 });
    const pts = [[0, H + 1.0, zTop + 5.6], [0, H + 1.0, zTop + 0.6], [0, H + 0.6, zTop - 0.6], [0, H - 1.4, zTop - 1.7],
      [0, H * 0.74, -D * 0.45 - 1.3], [0, H * 0.42, -D / 2 - 1.1], [0, H * 0.2, -D / 2 - 1.6], [0, pool + 0.05, -D / 2 - 2.0]];
    addWater(k, waterRibbon(pts, pts.map((p, i) => 6.0 + i * 0.15), [1, 0]));
    // A raised rocky basin catches the falls, foaming where they land.
    k.add(lump(new THREE.CylinderGeometry(1, 1.06, 1, 16, 1), 0.04, seed, -0.49), pick(STONE, r, 0.03), { s: [8.6, pool, 5.8], p: [0, pool / 2, zPool], jit: 0.05 });
    const poolG = paintFaces(disc([0.35, 0.7, 1], 20), (cx, cy, cz) => (Math.hypot(cx / 8, cz / 5.4) > 0.72 ? 0x5fc8ea : 0x2f9fd2), r, { jit: 0.02 });
    k.add(poolG, null, { s: [8, 1, 5.4], p: [0, pool + 0.02, zPool] });
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU;
      k.add(lump(new THREE.DodecahedronGeometry(1, 0), 0.12, i + seed), pick(STONE, r, 0.05),
        { s: [r.range(1, 1.6), r.range(0.8, 1.3), r.range(1, 1.5)], p: [Math.cos(a) * 8.5, pool + 0.1, zPool + Math.sin(a) * 5.6], jit: 0.05 });
    }
    for (let i = 0; i < 5; i++) {
      puff(k, (i - 2) * 1.4, pool + 0.35, -D / 2 - 2.0 + r.range(-0.4, 0.6), r.range(0.9, 1.3), 0.6, [WHITE, 0xd6eef8], 8);
    }
    k.root.userData.faceRoad = true;
    k.root.userData.embed = true;
    flows(k);
    return finish(k);
  });

  /* ── Jungle landmarks ───────────────────────────────────────────────── */

  /** A friendly feathered-serpent head for the foot of the temple stairs. */
  function serpentHead(k, x, y, z, sc) {
    k.add(roundBox(1.7 * sc, 1.4 * sc, 2.2 * sc, 0.55, 10, 8), 0x3fae6a, { p: [x, y, z], jit: 0.04 });
    k.add(roundBox(1.5 * sc, 0.5 * sc, 1.2 * sc, 0.6, 8, 6), 0xf5b82e, { p: [x, y + 0.75 * sc, z + 0.4 * sc] });
    [-1, 1].forEach((s) => eye(k, x + s * 0.45 * sc, y + 0.3 * sc, z - 1.02 * sc, 0.38 * sc, -1, {}));
    k.add(arcGeo(0.45 * sc, 0.08 * sc, 2.4), 0x7a2d1a, { p: [x, y - 0.1 * sc, z - 1.12 * sc] });
    for (let i = 0; i < 3; i++) k.add(new THREE.ConeGeometry(0.22 * sc, 0.9 * sc, 4), i === 1 ? 0xff5a5a : 0xffd23f, { r: [0.5, 0, (i - 1) * 0.5], p: [x + (i - 1) * 0.4 * sc, y + 1.1 * sc, z + 0.7 * sc] });
  }

  /** A grand stepped pyramid: gold-banded tiers, a central stair, a smiling sun shrine. */
  prop('temple_big', (r) => {
    const k = new Kit(r), seed = r.next() * 99;
    const stone = [0xb3b89e, 0xa3ab8f, 0xbfc3aa], moss = pick(MOSS, r, 0.03), dark = 0x5c6650;
    const tiers = 5, th = 3.8, hw = [20, 16.8, 13.6, 10.4, 7.2], slant = 1.0, dz = 0.9;
    for (let i = 0; i < tiers; i++) {
      const y = i * th, top = hw[i] - slant;
      k.add(sqFrustum(top, hw[i], th), stoneBlocks(stone, seed + i, moss, y + th), { s: [1, 1, dz], p: [0, y + th / 2, 0], jit: 0.04 });
      k.add(sqFrustum(top + 0.2, top + 0.28, 0.4), GOLD, { s: [1, 1, dz], p: [0, y + th - 0.45, 0] });
      // Carved glyph panels either side of the stair.
      [-1, 1].forEach((s) => {
        for (let g = 0; g < 2; g++) {
          const x = s * (5.6 + g * 3.3);
          if (x * s > top - 1.6) continue;
          const zf = -(hw[i] - slant * 0.5) * dz;
          k.add(new THREE.BoxGeometry(2.2, 2.0, 0.4), dark, { r: [0.23, 0, 0], p: [x, y + th * 0.5, zf - 0.02] });
          k.add(new THREE.OctahedronGeometry(0.45, 0), GOLD, { s: [1, 1, 0.5], r: [0.23, 0, 0], p: [x, y + th * 0.5, zf - 0.28] });
        }
      });
    }
    const yTop = tiers * th, z0 = -hw[0] * dz, z1 = -(hw[tiers - 1] - slant) * dz;
    const steps = 19;
    for (let j = 0; j < steps; j++) {
      const y = (j + 0.5) * yTop / steps, z = z0 + (z1 - z0) * (j / steps) - 0.3;
      k.add(new THREE.BoxGeometry(7, yTop / steps, 2.8), j % 2 ? 0xe2dcc0 : 0xd4cfb2, { p: [0, y, z + 1.4], jit: 0.03 });
    }
    [-1, 1].forEach((s) => {
      k.add(bar([s * 4.1, 0.7, z0 - 0.8], [s * 4.1, yTop + 0.5, z1 - 0.4], 1.2, 1.3), stone[1], { jit: 0.04 });
      k.add(bar([s * 4.1, 1.35, z0 - 0.8], [s * 4.1, yTop + 1.15, z1 - 0.4], 1.3, 0.3), GOLD);
      serpentHead(k, s * 4.1, 1.1, z0 - 2.0, 1.3);
    });
    // Shrine with a gold-framed door, a roof comb and the smiling sun disc.
    const sy = yTop, sz = 0.5;
    k.add(new THREE.BoxGeometry(9.6, 5, 7.2), stoneBlocks(stone, seed + 7), { p: [0, sy + 2.5, sz], jit: 0.04 });
    k.add(new THREE.BoxGeometry(2.6, 3.4, 0.4), 0x2a2620, { p: [0, sy + 1.7, sz - 3.65] });
    [[-1.5, sy + 1.8, 0.5, 3.8], [1.5, sy + 1.8, 0.5, 3.8], [0, sy + 3.65, 3.5, 0.5]].forEach(([x, y, w, h]) =>
      k.add(new THREE.BoxGeometry(w, h, 0.5), GOLD, { p: [x, y, sz - 3.75] }));
    k.add(new THREE.BoxGeometry(10.6, 0.8, 8.2), stone[2], { p: [0, sy + 5.4, sz], jit: 0.04 });
    k.add(new THREE.BoxGeometry(10.8, 0.3, 8.4), GOLD, { p: [0, sy + 5.0, sz] });
    k.add(new THREE.BoxGeometry(7.4, 2.6, 0.9), stone[0], { p: [0, sy + 7.0, sz + 1.2], jit: 0.04 });
    const dy = sy + 8.4, dzs = sz - 2.4;
    k.add(new THREE.CylinderGeometry(2.7, 2.7, 0.6, 20), GOLD, { r: [HALF_PI, 0, 0], p: [0, dy, dzs] });
    k.add(new THREE.TorusGeometry(2.7, 0.22, 5, 24), 0xd9921f, { p: [0, dy, dzs - 0.3] });
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      k.add(new THREE.ConeGeometry(0.5, 1.3, 4), i % 2 ? 0xff9a1f : GOLD, { r: [0, 0, a - HALF_PI], p: [Math.cos(a) * 3.45, dy + Math.sin(a) * 3.45, dzs] });
    }
    [-1, 1].forEach((s) => {
      k.add(arcGeo(0.42, 0.12, 2.6, true), 0x6b3a12, { p: [s * 0.95, dy + 0.45, dzs - 0.36] });
      k.add(ico(1, 1), 0xff8a5a, { s: [0.5, 0.32, 0.12], p: [s * 1.6, dy - 0.35, dzs - 0.32] });
    });
    k.add(arcGeo(1.05, 0.14, 2.4), 0x6b3a12, { p: [0, dy - 0.25, dzs - 0.36] });
    // Flaming braziers flank the shrine door.
    const fm = glowMat(0x5a2200, 1);
    [-1, 1].forEach((s) => {
      const x = s * 4.3, z = sz - 4.6;
      k.add(new THREE.CylinderGeometry(0.5, 0.6, 1.6, 6), stone[1], { p: [x, sy + 0.8, z] });
      k.add(new THREE.CylinderGeometry(0.8, 0.45, 0.5, 8), GOLD, { p: [x, sy + 1.85, z] });
      k.add(ico(0.55, 1), 0xff7a12, { s: [1, 0.8, 1], p: [x, sy + 2.25, z], mat: fm });
      k.add(new THREE.ConeGeometry(0.45, 1.5, 6), 0xffa21f, { p: [x, sy + 2.9, z], mat: fm });
      k.add(new THREE.ConeGeometry(0.25, 1.0, 5), 0xffd23f, { p: [x + 0.1, sy + 2.75, z - 0.2], mat: fm });
    });
    // Overgrowth: bushes on the tier corners, vines over the gold bands.
    for (let i = 0; i < tiers; i++) {
      for (let c = 0; c < 4; c++) {
        const sx = c & 1 ? 1 : -1, sz2 = c & 2 ? 1 : -1, w = hw[i] - slant - 0.6;
        lobe(k, sx * w, (i + 1) * th + 0.4, sz2 * w * dz, r.range(1.5, 2.3), pick(LEAF, r, 0.05), 0.62, false);
        if (r.chance(0.4)) k.add(ico(0.35, 0), r.pick(PETAL), { p: [sx * w + r.range(-1, 1), (i + 1) * th + 1.4, sz2 * w * dz - 0.8] });
      }
      for (let v = 0; v < 3; v++) {
        const x = r.sign() * r.range(5.6, hw[i] - 2.5);
        vine(k, x, (i + 1) * th - 0.2, -(hw[i] - slant) * dz - 0.25, r.range(1.8, 3.4), 1.3);
      }
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A giant smiling stone head with mossy cheeks and a crown of flowers. */
  prop('stone_head', (r) => {
    const k = new Kit(r), seed = r.next() * 99, stone = pick([0xa8a291, 0x9d9886], r, 0.02), moss = pick(MOSS, r, 0.03);
    const mossy = (top) => (cx, cy, cz) => {
      const n = hash3(Math.round(cx / 1.6), Math.round(cy / 1.6), Math.round(cz / 1.6), seed);
      return (cy > top - 1.2 || n > 0.62) ? moss : stone;
    };
    k.add(roundBox(10, 5.2, 8, 0.35, 14, 8), mossy(4.4), { p: [0, 2.2, 0.6], jit: 0.05 });
    const hy = 10, hz = 0;
    k.add(roundBox(8, 12, 7, 0.32, 16, 12), mossy(15.6), { p: [0, hy, hz], jit: 0.04 });
    const fz = hz - 3.5;
    k.add(roundBox(7.4, 1.3, 1.6, 0.45, 10, 6), shade(stone, -0.03), { p: [0, hy + 2.2, fz + 0.1], jit: 0.04 });
    [-1, 1].forEach((s) => {
      k.add(arcGeo(0.8, 0.24, 2.5, true), 0x4a443a, { p: [s * 1.85, hy + 0.35, fz - 0.02] });
      k.add(ico(1, 1), 0xf0a0a0, { s: [0.95, 0.6, 0.2], p: [s * 2.55, hy - 1.7, fz + 0.05] });
      k.add(roundBox(0.9, 5.2, 1.8, 0.5, 8, 8), shade(stone, -0.04), { p: [s * 4.15, hy + 0.6, hz - 0.4], jit: 0.04 });
    });
    k.add(new THREE.ConeGeometry(1.1, 4.0, 4), shade(stone, 0.02), { s: [1, 1, 0.55], r: [-0.08, Math.PI / 4, 0], p: [0, hy - 0.4, fz - 0.15] });
    k.add(arcGeo(1.8, 0.28, 2.3), 0x4a443a, { p: [0, hy - 2.8, fz - 0.02] });
    // Flower crown: a leafy band round the top of the head with big blooms.
    const cy = hy + 5.5, n = 14;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, x = Math.cos(a) * 3.55, z = hz + Math.sin(a) * 3.1;
      k.add(new THREE.OctahedronGeometry(1, 0), pick(LEAF, r, 0.05), { s: [1.2, 0.35, 0.65], r: [0, -a + HALF_PI, 0.3], p: [x, cy, z] });
    }
    const blooms = 7;
    for (let i = 0; i < blooms; i++) {
      const a = (i / blooms) * TAU + HALF_PI * 3 - TAU / blooms * 3, x = Math.cos(a) * 3.65, z = hz + Math.sin(a) * 3.2;
      const col = [0xff4f86, 0xffd23f, 0xff8a1f, 0xffffff, 0xc15cff][i % 5];
      for (let p = 0; p < 5; p++) {
        const pa = p / 5 * TAU;
        k.add(ico(1, 0), col, { s: [0.85, 0.28, 0.5], r: [0, pa, 0], p: [x + Math.cos(pa) * 0.62, cy + 0.35, z - Math.sin(pa) * 0.62] });
      }
      k.add(ico(0.36, 0), 0xffe066, { p: [x, cy + 0.55, z] });
    }
    k.add(roundBox(7.6, 1.2, 6.6, 0.5, 12, 6), moss, { p: [0, hy + 5.95, hz], jit: 0.06 });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Jungle hazards ─────────────────────────────────────────────────── */

  /** Block: a carved, grinning tiki totem with a leafy headdress (looks toward +Z). */
  hazard('tiki_block', 'block', 'jungle', (r) => {
    const k = new Kit(r, true), wood = pick([0xd07f3e, 0xc87638], r, 0.02), deep = 0x6e3818, teal = 0x22a89a;
    k.add(roundBox(2.6, 2.1, 2.3, 0.3, 12, 9), wood, { p: [0, 1.05, 0], jit: 0.04 });
    k.add(new THREE.BoxGeometry(2.66, 0.16, 2.36), deep, { p: [0, 0.16, 0], noInk: true });
    k.add(new THREE.BoxGeometry(2.64, 0.12, 2.34), teal, { p: [0, 0.36, 0], noInk: true });
    const fz = 1.15;
    [-1, 1].forEach((s) => {
      // Big round eyes under friendly arched brows; a rosy cheek below each.
      k.add(ico(1, 1), WHITE, { s: [0.36, 0.36, 0.12], p: [s * 0.56, 1.36, fz] });
      k.add(ico(1, 1), INK, { s: [0.18, 0.21, 0.08], p: [s * 0.52, 1.32, fz + 0.08], noInk: true });
      k.add(ico(1, 0), WHITE, { s: [0.07, 0.07, 0.04], p: [s * 0.52 + 0.08, 1.4, fz + 0.15], noInk: true });
      k.add(arcGeo(0.34, 0.075, 2.0, true), deep, { p: [s * 0.56, 1.58, fz + 0.02] });
      k.add(ico(1, 1), 0xf0565a, { s: [0.2, 0.13, 0.06], p: [s * 0.98, 0.98, fz - 0.03], noInk: true });
    });
    k.add(new THREE.ConeGeometry(0.24, 0.5, 3), shade(wood, -0.1), { s: [1.2, 1, 0.6], p: [0, 1.08, fz + 0.03] });
    // A wide toothy grin with a little tongue.
    k.add(roundBox(1.36, 0.48, 0.2, 0.4, 8, 6), deep, { p: [0, 0.7, fz - 0.02] });
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.22, 0.13, 0.1), 0xfff4dc, { p: [(i - 1.5) * 0.27, 0.86, fz + 0.07], noInk: true });
    k.add(ico(1, 1), 0xff6f7d, { s: [0.26, 0.11, 0.08], p: [0.12, 0.57, fz + 0.06], noInk: true });
    // A crest of upright leaves at the back of the head, a yellow flower in front.
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.38;
      k.add(new THREE.OctahedronGeometry(1, 0), i % 2 ? 0x3fae4a : 0x2c9a40, { s: [0.2, 0.42, 0.07], r: [-0.15, 0, a], p: [Math.sin(a) * 0.5, 2.18 + Math.cos(a) * 0.16, -0.45] });
    }
    k.add(ico(0.18, 0), 0xffd23f, { p: [0.55, 2.1, 0.55] });
    const out = sizeHazard(k, [2.8, 2.45, 2.6]);
    shadow(out, 3.4, 3.0);
    return out;
  });

  /** Roller: a big hairy coconut with a cheeky face (spins about Z; face toward +Z). */
  hazard('coconut', 'roller', 'jungle', (r) => {
    const k = new Kit(r, true), R = 1.0, seed = r.next() * 99;
    const node = new THREE.Group();
    node.position.y = R;
    const husk = [0x8a5a33, 0x6e4526, 0xa06a3c];
    k.add(lump(ico(R * 0.985, 2), 0.025, seed), (cx, cy, cz) => husk[(hash3(Math.round(cx * 4), Math.round(cy * 4), Math.round(cz * 4), seed) > 0.3) ? 2 : (hash3(cx, cy, cz, seed) > 0.2 ? 1 : 0)], { jit: 0.06 }, node);
    // The three dark "eyes" of a coconut sit on the back; the real face is in front.
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      k.add(ico(0.1, 0), 0x3b2412, { s: [1, 1, 0.4], p: [Math.cos(a) * 0.18, Math.sin(a) * 0.18, -0.97], noInk: true }, node);
    }
    [-1, 1].forEach((s) => {
      eye(k, s * 0.34, 0.22, 0.86, 0.3, 1, { parent: node, look: 0.7 });
      k.add(new THREE.BoxGeometry(0.34, 0.08, 0.1), 0x3b2412, { r: [0, 0, s * (s > 0 ? 0.35 : -0.1)], p: [s * 0.36, 0.56, 0.84] }, node);
      k.add(ico(1, 1), 0xff8f8f, { s: [0.14, 0.08, 0.05], p: [s * 0.55, -0.1, 0.83], noInk: true }, node);
    });
    k.add(arcGeo(0.3, 0.06, 2.2), 0x3b2412, { p: [0.05, -0.18, 0.95] }, node);
    k.add(ico(1, 1), 0xff5f7a, { s: [0.13, 0.15, 0.07], p: [0.12, -0.42, 0.9] }, node);
    centreBall(node, R);
    A.ink(node, 0.055);
    const roll = keep(node);
    roll.name = 'roll';
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  });

  /**
   * Geyser builder shared by both themes: an inked base and a separate column
   * node that rises from y = 0. setState follows props-moonlight's geyser():
   * hidden when idle, a steady low stub while warning, full height (with a
   * gentle surge) while active — never a flashing effect.
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

  /** Geyser: a mossy stone basin whose spring shoots up a 6 m water column. */
  hazard('water_spout', 'geyser', 'jungle', (r) => {
    const k = new Kit(r, true), stone = pick(STONE, r, 0.02), moss = pick(MOSS, r, 0.02);
    k.add(new THREE.CylinderGeometry(1.05, 1.2, 0.34, 12, 1, true), stone, { p: [0, 0.17, 0], jit: 0.05 });
    k.add(new THREE.TorusGeometry(1.0, 0.13, 5, 16), (cx, cy, cz) => (hash3(Math.round(cx * 3), 0, Math.round(cz * 3), 5) > -0.2 ? moss : stone), { r: [HALF_PI, 0, 0], p: [0, 0.35, 0] });
    k.add(new THREE.CircleGeometry(0.95, 14), 0x3fb6e0, { r: [-HALF_PI, 0, 0], p: [0, 0.27, 0], noInk: true });
    k.add(new THREE.CircleGeometry(0.4, 10), 0x9fe3ff, { r: [-HALF_PI, 0, 0], p: [0, 0.28, 0], noInk: true });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      k.add(lump(new THREE.DodecahedronGeometry(0.22, 0), 0.1, i), stone, { s: [1.2, 0.7, 1], p: [Math.cos(a) * 1.25, 0.1, Math.sin(a) * 1.25] });
      k.add(new THREE.OctahedronGeometry(0.2, 0), 0x3fae4a, { s: [1.6, 0.3, 0.7], r: [0, a, 0], p: [Math.cos(a + 0.8) * 1.15, 0.38, Math.sin(a + 0.8) * 1.15], noInk: true });
    }
    A.ink(k.root, 0.05);
    const out = finish(k);
    const ck = new Kit(r, true);
    ck.add(new THREE.CylinderGeometry(0.62, 0.78, 5.3, 12, 6), (cx, cy, cz) => ((Math.floor(cy * 1.4 + Math.atan2(cz, cx) / TAU * 4) & 1) ? 0x8fdcff : 0xd6f6ff), { p: [0, 2.85, 0] });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      puff(ck, Math.cos(a) * 0.48, 5.55, Math.sin(a) * 0.48, 0.34, 0.9, [WHITE, 0xd8f4ff], 8);
    }
    puff(ck, 0, 5.75, 0, 0.42, 0.85, [WHITE, 0xd8f4ff], 8);
    A.ink(ck.root, 0.05);
    const column = flagInk(A.mergeByMaterial(ck.root));
    return geyserRig(out, column);
  });

  /**
   * Puddle builder: a lane-wide 3.6 × 6 m blob at y = 0.02 whose outermost
   * ring is painted dark (its ink line — a flat decal cannot carry a hull).
   */
  function puddleBase(k, radii, fill, rim, halfW, halfL) {
    const shape = blobShape(k.rng, 0.05);
    const g = paintFaces(disc(radii, 36, shape), (cx, cy, cz) => {
      const rho = Math.hypot(cx, cz) / shape(Math.atan2(cz, cx));
      return rho > 0.955 ? rim : fill(rho, cx, cz);
    }, k.rng, { jit: 0.025 });
    k.add(g, null, { s: [halfW, 1, halfL], p: [0, 0.02, 0], noInk: true });
    return shape;
  }

  /** Puddle: sticky jungle mud with fallen leaves and fat bubbles. */
  hazard('jungle_mud', 'puddle', 'jungle', (r) => {
    const k = new Kit(r, true), seed = r.next() * 99, HW = 1.7, HL = 2.86;
    const mud = 0x6b4226, deep = 0x4e2f19, wet = 0x8c5e37;
    const shape = puddleBase(k, [0.2, 0.42, 0.62, 0.8, 0.9, 0.955, 1],
      (rho, x, z) => (rho > 0.82 ? wet : (hash3(Math.round(x * 3), 0, Math.round(z * 3), seed) > 0.25 ? deep : mud)), 0x2a180c, HW, HL);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + r.range(-0.12, 0.12), s = shape(a) * 0.86, rad = 0.2 * r.range(0.75, 1.2);
      k.add(new THREE.DodecahedronGeometry(rad, 0), tone(0x7a4d2b, r, 0.04),
        { s: [1.3, 0.42, 1.3], r: [0, r.range(0, TAU), 0], p: [Math.cos(a) * s * HW, 0.02 + rad * 0.42, Math.sin(a) * s * HL], jit: 0.06 });
    }
    for (let i = 0; i < 7; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.7;
      const g = paintFaces(twoSided(leafGeo(r.range(0.45, 0.65), 0.14, { n: 3, a0: 0.12, curl: 0.25, fold: 0.15 })),
        r.pick([0x3fae4a, 0x8cc63f, 0xf0a030, 0x2c9a40]), r, { jit: 0.04 });
      k.add(g, null, { r: [0, r.range(0, TAU), 0], order: 'YZX', p: [Math.cos(a) * d * HW, 0.035, Math.sin(a) * d * HL], noInk: true });
    }
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.6, rb = r.range(0.16, 0.3);
      const x = Math.cos(a) * d * HW, z = Math.sin(a) * d * HL;
      k.add(new THREE.SphereGeometry(rb, 8, 4, 0, TAU, 0, HALF_PI), tone(0x5a371e, r, 0.04), { p: [x, 0.02, z] });
      k.add(new THREE.OctahedronGeometry(rb * 0.22, 0), 0xf3e6d0, { p: [x - rb * 0.35, 0.02 + rb * 0.8, z - rb * 0.35], noInk: true });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * FLOATING ISLES — bright sky, white marble, gold trim, pastel flowers
   * ════════════════════════════════════════════════════════════════════════ */
  const GRASS = [0x8fe06a, 0x7fd65c, 0x9be87a];
  const MARBLE = 0xf7f3ea;
  const CREAM = 0xf3e6c8;
  const PASTEL = [0xffa9cf, 0xc9a7ff, 0xffe27a, 0x9fd8ff, 0xa8f0c8, 0xffc4a3];
  const CLOUD = [0xffffff, 0xdfe8f7];
  const EARTH = [0x9a6b4a, 0xb4835a, 0x87593b];
  const SKYGOLD = 0xf2c033;

  /** A round, fluffy pastel tree (green or blossom) with a curvy trunk. */
  function skyTree(k, x, y, z, sc, blossom, parent) {
    const r = k.rng, trunk = pick([0xb58a63, 0xa97c55], r, 0.03), H = r.range(2.6, 3.2) * sc;
    const bend = r.range(-0.4, 0.4) * sc;
    const p0 = [x, y, z], p1 = [x + bend, y + H * 0.5, z], p2 = [x - bend * 0.3, y + H, z + bend * 0.3];
    k.add(rod(p0, p1, 0.32 * sc, 0.26 * sc, 6), trunk, { jit: 0.04 }, parent);
    k.add(rod(p1, p2, 0.26 * sc, 0.2 * sc, 6), trunk, { jit: 0.04 }, parent);
    const col = blossom ? pick([0xffb3d4, 0xff9fc8, 0xffc2dd], r, 0.03) : pick([0x9be07a, 0x8ad46b, 0xa6e88a], r, 0.03);
    const cx = p2[0], cy = p2[1] + 1.3 * sc, cz = p2[2], R = 1.9 * sc;
    const ball = (px, py, pz, rr) => k.add(lump(ico(1, 1), 0.05, r.next() * 99), col, { s: [rr, rr * 0.92, rr], p: [px, py, pz], jit: 0.05, grad: 0.35 }, parent);
    ball(cx, cy, cz, R);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + r.range(-0.3, 0.3);
      ball(cx + Math.cos(a) * R * 0.75, cy + r.range(-0.5, 0.1) * sc, cz + Math.sin(a) * R * 0.75, R * r.range(0.6, 0.72));
    }
    ball(cx, cy + R * 0.7, cz, R * 0.62);
    const dots = blossom ? 0xffffff : r.pick([0xffffff, 0xff9fc8, 0xffe27a]);
    for (let i = 0; i < 9; i++) {
      const a = r.range(0, TAU), up = r.range(-0.1, 0.85), h = Math.sqrt(1 - up * up);
      k.add(ico(0.14 * sc, 0), dots, { p: [cx + Math.cos(a) * h * R * 1.08, cy + up * R * 1.0, cz + Math.sin(a) * h * R * 1.08] }, parent);
    }
  }

  /** A daisy-like pastel flower: petal ring around a golden centre. */
  function daisy(k, x, y, z, sc, col, tilt, parent) {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU;
      k.add(new THREE.OctahedronGeometry(1, 0), col, { s: [0.2 * sc, 0.035 * sc, 0.085 * sc], r: [0, -a, 0.25], order: 'XYZ', p: [x + Math.cos(a) * 0.2 * sc, y, z + Math.sin(a) * 0.2 * sc] }, parent);
    }
    k.add(ico(0.09 * sc, 0), 0xffc93a, { s: [1, 0.6, 1], p: [x, y + 0.03 * sc, z] }, parent);
  }

  /* ── Isles near ─────────────────────────────────────────────────────── */

  prop('cloud_puff', (r) => {
    const k = new Kit(r), n = r.int(5, 7), sc = r.range(0.85, 1.15);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.range(-0.3, 0.3), d = i ? r.range(0.9, 1.4) * sc : 0, R = (i ? r.range(0.8, 1.1) : 1.35) * sc;
      puff(k, Math.cos(a) * d, R * 0.62, Math.sin(a) * d * 0.8, R, 0.85, CLOUD, 12);
    }
    puff(k, r.range(-0.3, 0.3), 1.55 * sc, 0, 0.95 * sc, 0.85, CLOUD, 12);
    return finish(k);
  });

  prop('sky_flower', (r) => {
    const k = new Kit(r), n = r.int(5, 7), cols = [0xffa9cf, 0xc9a7ff, 0xffe27a, 0xffffff, 0xffc4a3];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + r.range(-0.3, 0.3);
      const g = paintFaces(twoSided(leafGeo(r.range(0.45, 0.6), 0.13, { n: 3, a0: 0.9, curl: 1.4, fold: 0.2 })), pick(GRASS, r, 0.04), r, {});
      k.add(g, null, { r: [0, a, 0], order: 'YZX', p: [0, 0.02, 0] });
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), d = i ? r.range(0.2, 0.6) : 0, h = r.range(0.75, 1.45);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, tip = [x * 1.25, h, z * 1.25];
      k.add(rod([x * 0.4, 0, z * 0.4], tip, 0.03, 0.025, 4), 0x5fb84a);
      daisy(k, tip[0], tip[1], tip[2], r.range(0.9, 1.25), cols[i % cols.length]);
    }
    return finish(k);
  });

  prop('windmill_small', (r) => {
    const k = new Kit(r), roof = r.pick([0xff9fc8, 0x8fc3ff, 0xc9a7ff]), H = 4.3;
    k.add(new THREE.CylinderGeometry(1.5, 1.6, 0.5, 10), 0xd8d2c4, { p: [0, 0.25, 0], jit: 0.04 });
    k.add(new THREE.CylinderGeometry(1.0, 1.35, H, 10, 2), MARBLE, { p: [0, 0.5 + H / 2, 0], jit: 0.02, grad: 0.15 });
    k.add(new THREE.CylinderGeometry(1.06, 1.06, 0.2, 10), SKYGOLD, { p: [0, 0.5 + H, 0] });
    k.add(new THREE.ConeGeometry(1.45, 1.9, 10), roof, { p: [0, 0.5 + H + 1.05, 0], jit: 0.03 });
    k.add(ico(0.18, 1), SKYGOLD, { p: [0, 0.5 + H + 2.1, 0] });
    k.add(new THREE.BoxGeometry(0.75, 1.3, 0.2), 0x8fc3ff, { p: [0, 1.15, -1.32], r: [0.04, 0, 0] });
    k.add(new THREE.TorusGeometry(0.3, 0.06, 4, 12), SKYGOLD, { p: [0, 3.2, -1.15], r: [0.08, 0, 0] });
    k.add(new THREE.CircleGeometry(0.3, 10), 0x4a6a9a, { p: [0, 3.2, -1.14], r: [Math.PI + 0.08, 0, 0] });
    const hub = new THREE.Group();
    hub.position.set(0, 0.5 + H - 0.45, -1.65);
    k.add(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), 0x9a7b5a, { r: [HALF_PI, 0, 0], p: [0, 0, 0.5] }, hub);
    k.add(ico(0.2, 0), SKYGOLD, { p: [0, 0, -0.12] }, hub);
    const sails = [0xffa9cf, 0xffe27a, 0x9fd8ff, 0xa8f0c8];
    for (let i = 0; i < 4; i++) {
      const rot = { r: [0, 0, i * HALF_PI] };
      k.add(place(new THREE.BoxGeometry(0.1, 2.05, 0.08), { p: [0, 1.08, -0.08] }), 0xf3e6c8, rot, hub);
      k.add(place(new THREE.BoxGeometry(0.66, 1.5, 0.05), { p: [0.38, 1.25, -0.06] }), sails[i], rot, hub);
    }
    const spin = keep(hub);
    k.root.add(spin);
    anim(k, spin, 'spin', 'z', r.range(0.8, 1.2));
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  prop('banner_pole', (r) => {
    const k = new Kit(r), H = r.range(4.8, 5.2), cols = r.pick([[0xffa9cf, 0xffffff], [0x9fd8ff, 0xffffff], [0xc9a7ff, 0xffe27a]]);
    k.add(new THREE.BoxGeometry(0.6, 0.4, 0.6), MARBLE, { p: [0, 0.2, 0], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(0.07, 0.09, H, 8), MARBLE, { p: [0, 0.4 + H / 2, 0] });
    [1.2, H].forEach((y) => k.add(new THREE.TorusGeometry(0.1, 0.035, 4, 10), SKYGOLD, { r: [HALF_PI, 0, 0], p: [0, y, 0] }));
    k.add(ico(0.16, 1), SKYGOLD, { p: [0, 0.4 + H + 0.14, 0] });
    // The pennant streams out along +X with a soft wave, forked at the tail.
    const node = new THREE.Group();
    node.position.set(0, 0.4 + H - 0.15, 0);
    const L = 2.8, segs = 7, pos = [];
    const pt = (u, v) => [u * L, -v * 0.75 * (1 - u * 0.55), Math.sin(u * 4.2) * 0.2 * u];
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs, fork = i === segs - 1;
      const a = pt(u0, 0), b = pt(u1, fork ? 0.12 : 0), c = pt(u1, fork ? 0.88 : 1), d = pt(u0, 1);
      if (fork) {
        const m = pt(u0 + 0.5 / segs, 0.5);
        pos.push(...a, ...m, ...b, ...d, ...c, ...m, ...a, ...d, ...m);
      } else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    k.add(paintFaces(twoSided(g), (cx) => (Math.floor(cx / L * segs) % 2 ? cols[1] : cols[0]), r, { jit: 0.02 }), null, {}, node);
    const pen = keep(node);
    k.root.add(pen);
    anim(k, pen, 'sway', 'y', r.range(1.3, 1.8), 0.22, r.range(0, TAU));
    anim(k, pen, 'sway', 'x', r.range(2.2, 2.8), 0.07, r.range(0, TAU));
    return finish(k);
  });

  /** Pastel crystals growing out of a rock (glowing accents on their own material). */
  function crystalCluster(k, sc, down) {
    const r = k.rng, n = r.int(4, 6), gm = glowMat(0x24123a, 1);
    const cols = [0xffa9d6, 0xc7a6ff, 0x9ff0ff, 0xb8f5d0];
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), tilt = i ? r.range(down ? 0.22 : 0.25, down ? 0.5 : 0.6) : r.range(0, 0.1);
      const L = (i ? r.range(down ? 0.5 : 0.55, down ? 0.78 : 0.85) : 1) * sc * (down ? 1 : 1.9), rad = (i ? r.range(0.13, 0.2) : 0.24) * sc * (down ? 0.5 : 1);
      const col = r.pick(cols), dirv = [Math.cos(a) * Math.sin(tilt), Math.cos(tilt) * (down ? -1 : 1), Math.sin(a) * Math.sin(tilt)];
      const base = [Math.cos(a) * (i ? (down ? 0.1 : 0.25) : 0) * sc, 0, Math.sin(a) * (i ? (down ? 0.1 : 0.25) : 0) * sc];
      const prism = new THREE.CylinderGeometry(rad, rad, L * 0.72, 6).translate(0, L * 0.36, 0);
      const tip = new THREE.ConeGeometry(rad, L * 0.28, 6).translate(0, L * 0.86, 0);
      [prism, tip].forEach((g, j) => {
        orient(g, dirv, base);
        k.add(g, j ? shade(col, 0.08) : col, { jit: 0.05, mat: gm });
      });
    }
  }

  prop('crystal_small', (r) => {
    const k = new Kit(r), sc = r.range(0.95, 1.1);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + r.range(0, 1);
      k.add(lump(new THREE.DodecahedronGeometry(0.45, 0), 0.12, i), pick([0xa99ec0, 0x9a8fb0], r, 0.03), { s: [1.2, 0.6, 1], p: [Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35], jit: 0.05 });
    }
    crystalCluster(k, sc, false);
    return finish(k);
  });

  prop('sky_tree', (r) => { const k = new Kit(r); skyTree(k, 0, 0, 0, r.range(0.95, 1.1), r.chance(0.45)); return finish(k); });

  /* ── Isles far ──────────────────────────────────────────────────────── */

  /** A dangling root: a wiggling, tapering chain from `p` down `len` metres. */
  function hangRoot(k, p, len, rad, spread, parent) {
    const r = k.rng, segs = 5, a = r.range(0, TAU), col = pick([0x8a5b3c, 0x7a4e32, 0x9a6a46], r, 0.03);
    let cur = p.slice();
    for (let i = 0; i < segs; i++) {
      const t = (i + 1) / segs;
      const nxt = [p[0] + Math.cos(a) * spread * t + r.range(-0.3, 0.3) * rad * 4, p[1] - len * t, p[2] + Math.sin(a) * spread * t + r.range(-0.3, 0.3) * rad * 4];
      k.add(rod(cur, nxt, rad * (1 - i / segs * 0.8), rad * (1 - (i + 1) / segs * 0.8) + 0.02, 5), col, { jit: 0.04 }, parent);
      if (i === 1 && r.chance(0.7)) {
        const side = [nxt[0] + r.range(-1, 1) * len * 0.12, nxt[1] - len * 0.18, nxt[2] + r.range(-1, 1) * len * 0.12];
        k.add(rod(nxt, side, rad * 0.45, 0.03, 4), col, {}, parent);
      }
      cur = nxt;
    }
  }

  /**
   * A floating island body: grassy cap with a rounded rim and an earthy cone
   * tapering to a point `D` below. Origin = the top-surface centre.
   */
  function islandBody(k, R, D) {
    const r = k.rng, seed = r.next() * 99;
    const prof = [[0, 0.35], [0.45 * R, 0.28], [0.8 * R, 0.08], [R, -0.35], [1.03 * R, -1.1], [0.95 * R, -2.4],
      [0.84 * R, -0.2 * D], [0.66 * R, -0.38 * D], [0.45 * R, -0.57 * D], [0.25 * R, -0.76 * D], [0.1 * R, -0.92 * D], [0, -D]];
    const g = new THREE.LatheGeometry(prof.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y)), 18);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (y > -0.5) continue;
      const kk = 1 + 0.09 * hash3(x, y, z, seed);
      P.setXYZ(i, x * kk, y * (1 + 0.04 * hash3(z, x, y, seed)), z * kk);
    }
    g.computeVertexNormals();
    const grass = pick(GRASS, r, 0.03), edge = shade(grass, -0.12);
    k.add(g, (cx, cy, cz) => {
      if (cy > -1.0) return grass;
      if (cy > -2.6) return edge;
      const n = hash3(Math.round(cx / 3), Math.round(cy / 3), Math.round(cz / 3), seed);
      if (n > 0.6) return 0x9c8f86;
      return EARTH[((Math.floor(-cy / 2.4) % 3) + 3) % 3];
    }, { jit: 0.05 });
    const tufts = Math.round(R * 1.1);
    for (let i = 0; i < tufts; i++) {
      const a = i / tufts * TAU + r.range(-0.1, 0.1);
      k.add(lump(new THREE.DodecahedronGeometry(1, 0), 0.1, i + seed), (cx, cy) => (cy > -0.6 ? grass : edge),
        { s: [r.range(1.0, 1.5), r.range(0.6, 0.8), r.range(1.0, 1.5)], p: [Math.cos(a) * R * 0.99, -0.5, Math.sin(a) * R * 0.99], jit: 0.05 });
    }
    return seed;
  }

  /** A tiny white cottage with a pastel roof, built round its own node. */
  function cottage(k, x, z, yaw, sc) {
    const node = new THREE.Group();
    node.position.set(x, 0, z);
    node.rotation.y = yaw;
    const roof = k.rng.pick([0xff9fc8, 0x8fc3ff, 0xc9a7ff, 0xffb27a]);
    k.add(new THREE.BoxGeometry(4 * sc, 3 * sc, 3.4 * sc), CREAM, { p: [0, 1.5 * sc, 0], jit: 0.02 }, node);
    k.add(new THREE.CylinderGeometry(2.3 * sc, 2.3 * sc, 4.6 * sc, 3, 1, false, HALF_PI), roof, { s: [0.8, 1, 1], r: [0, 0, HALF_PI], p: [0, 3 * sc + 0.85 * sc, 0], jit: 0.03 }, node);
    k.add(new THREE.BoxGeometry(0.9 * sc, 1.6 * sc, 0.15 * sc), 0x8a5b3c, { p: [0, 0.8 * sc, -1.75 * sc] }, node);
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(0.75 * sc, 0.75 * sc, 0.12 * sc), 0x5a7fb8, { p: [s * 1.25 * sc, 1.8 * sc, -1.76 * sc] }, node);
      k.add(new THREE.BoxGeometry(0.9 * sc, 0.2 * sc, 0.3 * sc), 0xff9fc8, { p: [s * 1.25 * sc, 1.32 * sc, -1.85 * sc] }, node);
    });
    k.add(new THREE.BoxGeometry(0.6 * sc, 1.6 * sc, 0.6 * sc), 0xd8c8b0, { p: [1.1 * sc, 4.8 * sc, 0.6 * sc] }, node);
    k.root.add(node);
  }

  /** A trickle of water off the island rim at angle `a`, ending in a puff of mist. */
  function islandFall(k, R, a, len) {
    const c = Math.cos(a), s = Math.sin(a), rr = R * 1.0;
    k.add(new THREE.BoxGeometry(1.4, 0.08, R * 0.55), 0x5fc8ea, { r: [0, -a + HALF_PI, 0], p: [c * R * 0.7, 0.3, s * R * 0.7] });
    const pts = [[c * (R * 0.92), 0.2, s * (R * 0.92)], [c * (rr + 0.9), -0.3, s * (rr + 0.9)], [c * (rr + 1.4), -2.5, s * (rr + 1.4)]];
    for (let i = 1; i <= 4; i++) pts.push([c * (rr + 1.5), -2.5 - (len - 2.5) * i / 4, s * (rr + 1.5)]);
    addWater(k, waterRibbon(pts, pts.map((p, i) => 1.5 + i * 0.12), [-s, c]));
    for (let i = 0; i < 3; i++) puff(k, c * (rr + 1.5) + (i - 1) * -s * 1.1, -len - 0.4 + (i % 2) * 0.5, s * (rr + 1.5) + (i - 1) * c * 1.1, 1.1 + (i % 2) * 0.3, 0.8, CLOUD, 8);
  }

  prop('floating_island', (r) => {
    const k = new Kit(r), R = r.range(10, 17), D = r.range(15, 24);
    islandBody(k, R, D);
    if (r.chance(0.55)) {
      skyTree(k, r.range(-0.3, 0.3) * R, 0.2, r.range(-0.3, 0.3) * R, r.range(1.1, 1.4), r.chance(0.4));
      if (R > 13) skyTree(k, -0.5 * R, 0.1, 0.35 * R, 0.9, r.chance(0.5));
    } else {
      cottage(k, r.range(-0.2, 0.2) * R, r.range(-0.2, 0.2) * R, r.range(0, TAU), r.range(1, 1.3));
      skyTree(k, 0.5 * R, 0.1, -0.3 * R, 0.85, r.chance(0.5));
    }
    for (let i = 0; i < 5; i++) {
      const a = r.range(0, TAU), d = r.range(0.35, 0.8) * R;
      daisy(k, Math.cos(a) * d, 0.35, Math.sin(a) * d, 2.4, r.pick(PASTEL));
    }
    const roots = r.int(2, 4);
    for (let i = 0; i < roots; i++) {
      const a = r.range(0, TAU), d = R * r.range(0.4, 0.6);
      hangRoot(k, [Math.cos(a) * d, -0.45 * D + d * 0.3, Math.sin(a) * d], r.range(5, 8), 0.35, 1.5);
    }
    if (r.chance(0.6)) { islandFall(k, R, r.range(0, TAU), r.range(9, 13)); flows(k); }
    return finishFloat(k);
  });

  prop('airship', (r) => {
    const k = new Kit(r), L = r.range(28, 32), Rb = L * 0.17;
    const stripe = r.pick([0xff7eb6, 0x5fb8ff, 0xa983ff, 0xff9a4d]), body = CREAM;
    const ship = new THREE.Group();
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, y = (t - 0.5) * L;
      const rr = Rb * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.92))), 0.62);
      prof.push(new THREE.Vector2(i === 0 || i === 16 ? 0.001 : rr, y));
    }
    // Lathe along +Y (tail at -Y), then lay it along Z with the nose toward -Z.
    const env = new THREE.LatheGeometry(prof, 16).rotateX(-HALF_PI);
    k.add(env, (cx, cy, cz) => {
      if (cz < -L * 0.44) return SKYGOLD;
      if (cz > L * 0.38 && cz < L * 0.42) return SKYGOLD;
      const g = Math.floor((Math.atan2(cy, cx) + Math.PI) / TAU * 8 + 0.5) % 8;
      return g % 2 ? stripe : body;
    }, { jit: 0.025 }, ship);
    // Tail fins: four swept fins at the back.
    for (let i = 0; i < 4; i++) {
      const a = i * HALF_PI;
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(L * 0.2, 0); sh.lineTo(L * 0.22, Rb * 0.9); sh.lineTo(L * 0.1, Rb * 0.85); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false }).translate(0, 0, -0.175);
      // Shape x → body +Z, shape y → radial direction a.
      g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(a), Math.sin(a), 0), new THREE.Vector3(-Math.sin(a), Math.cos(a), 0)));
      g.translate(Math.cos(a) * Rb * 0.45, Math.sin(a) * Rb * 0.45, L * 0.26);
      k.add(g, i % 2 ? stripe : shade(stripe, -0.1), { jit: 0.03 }, ship);
    }
    // Gondola hung under the belly.
    const gy = -Rb - 1.6;
    k.add(roundBox(2.8, 2.2, 8.5, 0.35, 10, 8), CREAM, { p: [0, gy, -1], jit: 0.02 }, ship);
    k.add(new THREE.BoxGeometry(2.9, 0.25, 8.6), SKYGOLD, { p: [0, gy + 0.55, -1] }, ship);
    for (let i = 0; i < 5; i++) {
      [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(0.1, 0.6, 0.9), 0x4a6a9a, { p: [s * 1.38, gy + 0.1, -4 + i * 1.5] }, ship));
    }
    [[-1, -4], [1, -4], [-1, 2], [1, 2]].forEach(([s, z]) => k.add(rod([s * 0.9, gy + 0.9, z], [s * 1.6, -Rb * 0.75, z], 0.07, 0.07, 4), 0x9a7b5a, {}, ship));
    // Engine pods with propellers that spin.
    [-1, 1].forEach((s) => {
      const px = s * 3.1, py = gy + 0.2, pz = 2.5;
      k.add(rod([s * 1.3, py, pz], [px, py, pz], 0.12, 0.12, 5), 0x9a7b5a, {}, ship);
      k.add(ico(1, 1), stripe, { s: [0.6, 0.6, 1.3], p: [px, py, pz] }, ship);
      const hub = new THREE.Group();
      hub.position.set(px, py, pz + 1.35);
      k.add(new THREE.ConeGeometry(0.25, 0.5, 6), SKYGOLD, { r: [HALF_PI, 0, 0], p: [0, 0, 0.1] }, hub);
      for (let b = 0; b < 3; b++) k.add(place(new THREE.BoxGeometry(0.28, 1.5, 0.08), { p: [0, 0.75, 0], r: [0, 0.3, 0] }), 0xf3e6c8, { r: [0, 0, b / 3 * TAU] }, hub);
      const spinner = keep(hub);
      ship.add(spinner);
      anim(k, spinner, 'spin', 'z', s * r.range(5, 7));
    });
    // A little flag on the top fin and a gold star on each flank.
    [-1, 1].forEach((s) => k.add(new THREE.OctahedronGeometry(1.1, 0), SKYGOLD, { s: [0.1, 1, 1], p: [s * Rb * 0.98, Rb * 0.15, -L * 0.18] }, ship));
    const node = keep(ship);
    k.root.add(node);
    anim(k, node, 'bob', 'y', r.range(0.4, 0.6), 0.6, r.range(0, TAU));
    anim(k, node, 'sway', 'z', r.range(0.3, 0.45), 0.035, r.range(0, TAU));
    return finishFloat(k);
  });

  /** A round tower with a band, windows, a pointed roof and a gold finial. */
  function tower(k, x, y, z, rad, h, roof, parent, dome) {
    k.add(new THREE.CylinderGeometry(rad, rad * 1.06, h, 10), MARBLE, { p: [x, y + h / 2, z], jit: 0.02, grad: 0.1 }, parent);
    k.add(new THREE.CylinderGeometry(rad * 1.12, rad * 1.12, h * 0.05, 10), SKYGOLD, { p: [x, y + h, z] }, parent);
    if (dome) {
      k.add(new THREE.SphereGeometry(rad * 1.05, 12, 6, 0, TAU, 0, HALF_PI), SKYGOLD, { p: [x, y + h + h * 0.025, z], jit: 0.03 }, parent);
      k.add(new THREE.ConeGeometry(rad * 0.2, rad * 1.5, 6), SKYGOLD, { p: [x, y + h + rad * 1.6, z] }, parent);
    } else {
      k.add(new THREE.ConeGeometry(rad * 1.3, rad * 2.6, 10), roof, { p: [x, y + h + rad * 1.3, z], jit: 0.03 }, parent);
      k.add(ico(rad * 0.18, 0), SKYGOLD, { p: [x, y + h + rad * 2.65, z] }, parent);
    }
    for (let i = 0; i < 2; i++) {
      k.add(new THREE.BoxGeometry(rad * 0.35, rad * 0.6, 0.2), 0x4a6a9a, { p: [x, y + h * (0.45 + i * 0.3), z - rad * 1.02] }, parent);
    }
  }
  /** A pennant flag: a two-sided triangle on a short pole. */
  function pennant(k, x, y, z, size, col, parent) {
    k.add(new THREE.CylinderGeometry(0.06 * size, 0.06 * size, 2 * size, 4), 0xeeeeee, { p: [x, y + size, z] }, parent);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.6 * size, -0.35 * size, 0.15 * size, 0, -0.8 * size, 0], 3));
    k.add(paintFaces(twoSided(g), col, k.rng, {}), null, { p: [x, y + 2 * size, z] }, parent);
  }

  prop('cloud_castle', (r) => {
    const k = new Kit(r), roofs = [0x8fc3ff, 0xff9fc8, 0xc9a7ff];
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.range(-0.15, 0.15), d = i < 4 ? r.range(4, 9) : r.range(11, 17);
      puff(k, Math.cos(a) * d, r.range(-1.5, 1.5), Math.sin(a) * d * 0.85, r.range(5.2, 7.2), 0.6, CLOUD, 9);
    }
    const base = 2.2, roof = r.pick(roofs);
    k.add(new THREE.BoxGeometry(18, 8, 0.9), MARBLE, { p: [0, base + 4, -7], jit: 0.02 });
    k.add(new THREE.BoxGeometry(18, 8, 0.9), MARBLE, { p: [0, base + 4, 7], jit: 0.02 });
    [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(0.9, 8, 14), MARBLE, { p: [s * 9, base + 4, 0], jit: 0.02 }));
    [-7.45, 7.45].forEach((z) => {
      k.add(new THREE.BoxGeometry(18.2, 0.4, 0.3), SKYGOLD, { p: [0, base + 7.6, z] });
      for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(1.1, 1.1, 1.0), MARBLE, { p: [-7 + i * 2.8, base + 8.5, z * 0.94] });
    });
    // Gate with a gold arch facing -Z.
    k.add(new THREE.BoxGeometry(3.4, 4.2, 0.4), 0x5a6fa0, { p: [0, base + 2.1, -7.5] });
    k.add(new THREE.TorusGeometry(1.9, 0.3, 4, 12, Math.PI), SKYGOLD, { p: [0, base + 4.2, -7.6] });
    [[-9, -7], [9, -7], [-9, 7], [9, 7]].forEach(([x, z]) => {
      tower(k, x, base, z, 2.2, 13, roof);
      pennant(k, x, base + 13 + 2.2 * 2.65, z, 1.1, r.pick(PASTEL));
    });
    k.add(new THREE.BoxGeometry(10, 15, 8), MARBLE, { p: [0, base + 7.5, 1.5], jit: 0.02, grad: 0.08 });
    k.add(new THREE.BoxGeometry(10.4, 0.5, 8.4), SKYGOLD, { p: [0, base + 15, 1.5] });
    for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(1, 1.6, 0.2), 0x4a6a9a, { p: [(i - 1) * 3, base + 11, -2.6] });
    tower(k, 0, base + 15, 1.5, 3, 12, r.pick(roofs));
    pennant(k, 0, base + 27 + 3 * 2.65, 1.5, 1.5, SKYGOLD);
    [-1, 1].forEach((s) => tower(k, s * 4.6, base + 15, 4, 1.4, 6, roof));
    return finishFloat(k);
  });

  prop('cloud_bank', (r) => {
    const k = new Kit(r), W = r.range(56, 64);
    for (let i = 0; i < 8; i++) {
      const x = (i / 7 - 0.5) * W * 0.78;
      puff(k, x, -4.5 + r.range(-0.6, 0.6), r.range(-5, 5), r.range(7, 9), 0.55, CLOUD, 9);
    }
    for (let i = 0; i < 5; i++) {
      const x = (i / 4 - 0.5) * W * 0.55;
      puff(k, x + r.range(-2, 2), 1.5 + r.range(-1, 1.5), r.range(-4, 4), r.range(7.5, 10), 0.75, CLOUD, 9);
    }
    for (let i = 0; i < 3; i++) puff(k, (i - 1) * 9 + r.range(-2, 2), 5.5 + r.range(0, 1.5), r.range(-2, 2), r.range(5.5, 7), 0.85, CLOUD, 9);
    return finishFloat(k);
  });

  /* ── Isles landmarks ────────────────────────────────────────────────── */

  prop('sky_whale', (r) => {
    const k = new Kit(r), L = 34, Rm = 6.6;
    const back = pick([0x6f8fe8, 0x7a86e6, 0x6b9be0], r, 0.03), belly = 0xf6efe0, stripe = 0xf3d6d2;
    // Body profile along the length (t = 0 at the snout, -Z).
    const rad = (t) => (t < 0.32 ? Rm * Math.pow(Math.sin(HALF_PI * t / 0.32), 0.5) : Rm * (1 - 0.82 * Math.pow((t - 0.32) / 0.68, 1.5)));
    const z0 = -20, prof = [], tEnd = 0.9, SY = 0.9;
    // Lathe about +Y with y = z, then turned so +Y becomes +Z: the snout (t = 0) is at z0.
    for (let i = 0; i <= 18; i++) { const t = i / 18 * tEnd; prof.push(new THREE.Vector2(i === 0 ? 0.001 : rad(t), z0 + t * L)); }
    prof.push(new THREE.Vector2(0.001, z0 + tEnd * L));
    const body = new THREE.LatheGeometry(prof, 24).rotateX(HALF_PI);
    body.scale(1, SY, 1);
    // Where on the surface is the point at length fraction t, angle a round the axis?
    const surf = (t, a, out) => { const rr = rad(t) * (out || 1); return [Math.cos(a) * rr, Math.sin(a) * rr * SY, z0 + t * L]; };
    k.add(body, (cx, cy, cz) => {
      const t = U.clamp((cz - z0) / L, 0, 1), rr = rad(t) * SY;
      if (cy < -0.3 * rr) return (cz < z0 + L * 0.4 && Math.floor(cx / 0.9) % 2) ? stripe : belly;
      return back;
    }, { jit: 0.03 });
    // Spots along the back, lying flat on the skin.
    for (let i = 0; i < 7; i++) {
      const t = 0.3 + i * 0.075, a = HALF_PI + (i % 2 ? 0.55 : -0.55) + r.range(-0.15, 0.15);
      k.add(ico(1, 1), shade(back, 0.12), { s: [1.1, 0.25, 1.4], r: [0, 0, a - HALF_PI], p: surf(t, a, 0.985) });
    }
    // Smile wrapping round under the snout, eyes with glints, rosy cheeks.
    const sm = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14 * 2 - 1, au = Math.abs(u), t = 0.03 + au * 0.17;
      const a = -HALF_PI + Math.pow(au, 0.8) * (HALF_PI - 0.4) + Math.pow(au, 4) * 0.28;
      const p = surf(t, u < 0 ? Math.PI - a : a, 1.01);
      sm.push(p);
    }
    k.add(tubeGeo(sm, 0.32, 40, 5), 0x2d3561, {});
    [-1, 1].forEach((s) => {
      const t = 0.26, a = 0.2, e = surf(t, s > 0 ? a : Math.PI - a, 0.99);
      k.add(ico(1, 1), WHITE, { s: [0.6, 1.25, 1.15], p: e });
      k.add(ico(1, 1), INK, { s: [0.4, 0.8, 0.72], p: [e[0] + s * 0.42, e[1] - 0.12, e[2] - 0.15] });
      k.add(ico(1, 0), WHITE, { s: [0.15, 0.26, 0.26], p: [e[0] + s * 0.78, e[1] + 0.25, e[2] - 0.35] });
      k.add(ico(1, 1), 0xff9fb8, { s: [0.3, 0.7, 1.15], p: surf(0.3, s > 0 ? -0.3 : Math.PI + 0.3, 0.99) });
    });
    // A little spout of water from the blowhole.
    const by = rad(0.3) * SY, bz = z0 + 0.3 * L;
    k.add(new THREE.CylinderGeometry(0.35, 0.7, 3.2, 8), (cx, cy) => (cy > by + 1.6 ? 0xd6f6ff : 0x9fdcff), { p: [0, by + 1.3, bz] });
    puff(k, 0, by + 3.2, bz, 0.9, 0.8, [WHITE, 0xbfeaff], 8);
    // Five arcs of droplets fall away from the top of the spout like a fountain.
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3;
      for (let j = 1; j <= 4; j++) {
        const u = j / 4, d = 0.6 + u * 2.6, h = by + 3.1 + 1.0 * u - 3.0 * u * u;
        k.add(ico(0.42 - u * 0.12, 0), j % 2 ? 0xbfeaff : WHITE, { p: [Math.cos(a) * d, h, bz + Math.sin(a) * d] });
      }
    }
    // A grassy patch with a little tree riding on the whale's back.
    const gt = 0.5, gy = rad(gt) * SY;
    k.add(lump(new THREE.SphereGeometry(1, 12, 6), 0.05, 7), pick(GRASS, r, 0.03), { s: [3.5, 1.5, 4.4], p: [0, gy - 0.55, z0 + gt * L], jit: 0.05 });
    skyTree(k, 0.4, gy + 0.75, z0 + gt * L + 0.5, 1.0, r.chance(0.5));
    for (let i = 0; i < 4; i++) daisy(k, Math.cos(i * 1.7) * 2.2, gy + 0.55, z0 + gt * L + Math.sin(i * 1.7) * 2.8, 1.8, r.pick(PASTEL));
    // Flippers pivot at the flank and paddle together.
    [-1, 1].forEach((s) => {
      const t = 0.38, rr = rad(t), node = new THREE.Group();
      node.position.set(s * rr * 0.82, -rr * 0.45, z0 + t * L);
      k.add(ico(1, 1), (cx, cy) => (cy > 0 ? back : belly), { s: [4.4, 0.55, 1.9], r: [0, s * 0.35, s * -0.35], p: [s * 3.6, -1.2, 0.6], jit: 0.03 }, node);
      const fl = keep(node);
      k.root.add(fl);
      anim(k, fl, 'sway', 'z', 0.9, s * 0.22, 0);
    });
    // Tail stock and flukes beat up and down from a pivot near the back.
    const tn = new THREE.Group(), tz = z0 + 0.84 * L;
    tn.position.set(0, 0, tz);
    k.add(rod([0, 0, -0.6], [0, 0.4, 6.0], rad(0.84) * 0.86, 0.9, 10), back, { s: [1, SY, 1], jit: 0.03 }, tn);
    [-1, 1].forEach((s) => k.add(ico(1, 1), (cx, cy) => (cy > 0.35 ? back : shade(back, 0.08)), { s: [3.6, 0.45, 1.9], r: [0, s * -0.55, 0], p: [s * 2.8, 0.4, 7.0], jit: 0.03 }, tn));
    const tail = keep(tn);
    k.root.add(tail);
    anim(k, tail, 'sway', 'x', 0.8, 0.16, 0);
    k.root.userData.faceRoad = true;
    return finishFloat(k);
  });

  prop('sky_castle', (r) => {
    const k = new Kit(r), R = r.range(23, 26), D = r.range(24, 28);
    islandBody(k, R, D);
    const roofs = [0x8fc3ff, 0xff9fc8, 0xc9a7ff];
    // Curtain wall with crenellations and a gold trim.
    const wx = 15, wz = 12, wh = 8;
    k.add(new THREE.BoxGeometry(wx * 2, wh, 1.2), MARBLE, { p: [0, wh / 2, -wz], jit: 0.02 });
    k.add(new THREE.BoxGeometry(wx * 2, wh, 1.2), MARBLE, { p: [0, wh / 2, wz], jit: 0.02 });
    [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(1.2, wh, wz * 2), MARBLE, { p: [s * wx, wh / 2, 0], jit: 0.02 }));
    [-wz - 0.65, wz + 0.65].forEach((z) => {
      k.add(new THREE.BoxGeometry(wx * 2 + 0.4, 0.5, 0.3), SKYGOLD, { p: [0, wh - 0.6, z] });
      for (let i = 0; i < 9; i++) k.add(new THREE.BoxGeometry(1.4, 1.3, 1.2), MARBLE, { p: [-wx + 1.5 + i * (wx * 2 - 3) / 8, wh + 0.65, z - Math.sign(z) * 0.65] });
    });
    // Gate and a gold-railed stair down to the island's front edge.
    k.add(new THREE.BoxGeometry(4.6, 5.6, 0.5), 0x5a6fa0, { p: [0, 2.8, -wz - 0.4] });
    k.add(new THREE.TorusGeometry(2.6, 0.4, 4, 12, Math.PI), SKYGOLD, { p: [0, 5.6, -wz - 0.6] });
    k.add(new THREE.BoxGeometry(4.6, 0.25, R - wz - 1), 0xe8e0cc, { p: [0, 0.35, -(wz + R) / 2] });
    // Corner towers with gold domes, the great keep with its spire.
    [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].forEach(([x, z], i) => {
      tower(k, x, 0, z, 3, 16, roofs[i % 3], null, i < 2);
      pennant(k, x, 16 + (i < 2 ? 3 * 2.35 : 3 * 2.65), z, 1.4, r.pick(PASTEL));
    });
    k.add(new THREE.BoxGeometry(16, 16, 12), MARBLE, { p: [0, 8, 2], jit: 0.02, grad: 0.08 });
    k.add(new THREE.BoxGeometry(16.5, 0.6, 12.5), SKYGOLD, { p: [0, 16, 2] });
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(1.4, 2.4, 0.2), 0x4a6a9a, { p: [(i - 1.5) * 3.6, 11, -4.05] });
    tower(k, 0, 16, 2, 4.2, 15, 0, null, true);
    pennant(k, 0, 31 + 4.2 * 2.35, 2, 2, SKYGOLD);
    [-1, 1].forEach((s) => { tower(k, s * 6.5, 16, -2.5, 1.8, 7, r.pick(roofs)); });
    // Gardens on the island: trees and flowers outside the walls.
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) / 4 * TAU + r.range(-0.2, 0.2);
      skyTree(k, Math.cos(a) * R * 0.8, 0.15, Math.sin(a) * R * 0.78, 1.15, i % 2 === 0);
    }
    for (let i = 0; i < 8; i++) {
      const a = r.range(0, TAU), d = R * r.range(0.68, 0.88);
      daisy(k, Math.cos(a) * d, 0.3, Math.sin(a) * d, 2.6, r.pick(PASTEL));
    }
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, TAU), d = R * r.range(0.35, 0.55);
      hangRoot(k, [Math.cos(a) * d, -0.45 * D + d * 0.3, Math.sin(a) * d], r.range(7, 11), 0.5, 2);
    }
    islandFall(k, R, r.range(0.2, 1.2), r.range(14, 20));
    flows(k);
    k.root.userData.faceRoad = true;
    return finishFloat(k);
  });

  /* ── Island-underside dressing (origin = top attachment, hangs along -Y) ─ */

  prop('hanging_roots', (r) => {
    const k = new Kit(r), n = r.int(4, 7);
    k.add(lump(new THREE.SphereGeometry(1, 10, 5, 0, TAU, HALF_PI, HALF_PI), 0.08, r.next() * 99), (cx, cy) => (cy > -0.25 ? 0x6fbf4f : EARTH[0]),
      { s: [2.0, 1.0, 2.0], jit: 0.06 });
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.range(-0.3, 0.3), d = r.range(0.4, 1.4);
      hangRoot(k, [Math.cos(a) * d, -0.4, Math.sin(a) * d], r.range(6, 10), r.range(0.18, 0.28), r.range(1.0, 2.0));
    }
    for (let i = 0; i < 3; i++) {
      const a = r.range(0, TAU);
      k.add(new THREE.OctahedronGeometry(0.4, 0), pick(GRASS, r, 0.05), { s: [1.4, 0.5, 1], p: [Math.cos(a) * 1.6, -0.25, Math.sin(a) * 1.6] });
    }
    return finishTop(k);
  });

  prop('hanging_crystals', (r) => {
    const k = new Kit(r);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + r.range(0, 1);
      k.add(lump(new THREE.DodecahedronGeometry(0.9, 0), 0.12, i), pick([0xa99ec0, 0x9a8fb0, 0x8a7f9e], r, 0.03), { s: [1.25, 0.85, 1.15], p: [Math.cos(a) * 0.6, -0.35, Math.sin(a) * 0.6], jit: 0.05 });
    }
    crystalCluster(k, r.range(4.4, 5.6), true);
    return finishTop(k);
  });

  /* ── Isles hazards ──────────────────────────────────────────────────── */

  /** Block: a grumpy-cute storm cloud with a tiny lightning tuft (looks toward +Z). */
  hazard('cloud_block', 'block', 'isles', (r) => {
    const k = new Kit(r, true), grey = [0xa9b3c9, 0x7e89a3];
    // A big round "face" puff in front, side and back puffs, two on top.
    const lumps = [[-0.9, 0.72, -0.05, 0.75], [0.9, 0.72, -0.05, 0.75], [0, 0.8, -0.45, 0.78], [0, 1.0, 0.38, 0.86],
      [-0.5, 1.62, -0.12, 0.66], [0.52, 1.66, -0.18, 0.62], [0, 2.02, -0.25, 0.48]];
    lumps.forEach(([x, y, z, R]) => puff(k, x, y, z, R, 0.95, grey, 10));
    const fz = 1.18;
    [-1, 1].forEach((s) => {
      k.add(ico(1, 1), WHITE, { s: [0.24, 0.24, 0.12], p: [s * 0.32, 1.14, fz] });
      k.add(ico(1, 1), INK, { s: [0.12, 0.13, 0.07], p: [s * 0.29, 1.1, fz + 0.08], noInk: true });
      k.add(ico(1, 0), WHITE, { s: [0.04, 0.04, 0.03], p: [s * 0.29 + 0.05, 1.15, fz + 0.14], noInk: true });
      // Grumpy brows tilt down toward the middle; puffed rosy cheeks keep it cute.
      k.add(new THREE.BoxGeometry(0.36, 0.1, 0.12), 0x40465c, { r: [0, 0, s * 0.38], p: [s * 0.33, 1.36, fz - 0.01] });
      k.add(ico(1, 1), 0xff9fb8, { s: [0.13, 0.08, 0.05], p: [s * 0.58, 0.86, fz - 0.08], noInk: true });
    });
    k.add(arcGeo(0.17, 0.045, 2.3, true), 0x40465c, { p: [0, 0.7, fz] });
    k.add(boltGeo(0.7, 0.14), 0xffd23f, { r: [0, 0, -0.2], p: [0.3, 2.45, -0.2] });
    for (let i = 0; i < 3; i++) k.add(ico(1, 1), 0x7fd0ff, { s: [0.09, 0.14, 0.09], p: [-1.28 + i * 0.12, 0.42 - i * 0.12, 0.5 - i * 0.2], noInk: true });
    const out = sizeHazard(k, [2.8, 2.45, 2.6]);
    shadow(out, 3.4, 3.0);
    return out;
  });

  /** Roller: a rolling ball of storm cloud crackling with yellow zig-zags. */
  hazard('thunder_ball', 'roller', 'isles', (r) => {
    const k = new Kit(r, true), R = 1.0;
    const node = new THREE.Group();
    node.position.y = R;
    const cols = [0x6b7194, 0x565c82], top = 0x8d93b8;
    // A smooth storm-cloud core carries the face; puffy lobes ring the rest.
    k.add(ico(0.8, 2), (cx, cy) => (cy > 0.4 ? top : cols[1]), { jit: 0.04, noInk: true }, node);
    const n = 18, lr = 0.44;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
      const dz = Math.sin(a) * rr;
      if (dz > 0.55) continue;                         // keep the face clear
      const d = R - lr;
      k.add(ico(lr, 1), (cx, cy) => (cy > 0.3 ? top : cols[i % 2]), { p: [Math.cos(a) * rr * d, y * d, dz * d], jit: 0.05, noInk: true }, node);
    }
    // Zig-zags lie flat on the surface, tangent to it, all round the ball.
    const dirs = [[0.62, 0.62, 0.48], [-0.75, 0.3, 0.58], [0.15, -0.8, 0.58], [0.95, -0.2, -0.2], [-0.9, -0.35, -0.25],
      [-0.2, 0.95, -0.25], [0.4, -0.5, -0.77], [-0.45, 0.45, -0.77]];
    const v = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    dirs.forEach((d, i) => {
      v.set(d[0], d[1], d[2]).normalize();
      t1.set(0, 0, 1).cross(v);
      if (t1.lengthSq() < 1e-3) t1.set(1, 0, 0);
      t1.normalize().applyAxisAngle(v, i * 1.1);
      t2.crossVectors(v, t1);
      const g = boltGeo(0.42, 0.06);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(t1, t2, v));
      g.translate(v.x * 0.93, v.y * 0.93, v.z * 0.93);
      k.add(g, 0xffd23f, {}, node);
    });
    [-1, 1].forEach((s) => {
      k.add(ico(1, 1), 0xfff3a0, { s: [0.2, 0.24, 0.1], p: [s * 0.27, 0.16, 0.84] }, node);
      k.add(ico(1, 1), INK, { s: [0.1, 0.13, 0.05], p: [s * 0.24, 0.13, 0.92], noInk: true }, node);
      k.add(ico(1, 0), WHITE, { s: [0.035, 0.035, 0.02], p: [s * 0.24 + 0.04, 0.18, 0.96], noInk: true }, node);
      k.add(new THREE.BoxGeometry(0.26, 0.06, 0.06), 0x2a2d44, { r: [0, 0, s * 0.3], p: [s * 0.27, 0.45, 0.8] }, node);
    });
    k.add(arcGeo(0.2, 0.05, 2.4), 0x2a2d44, { p: [0, -0.14, 0.88] }, node);
    centreBall(node, R);
    // One clean silhouette line round the ball, plus ink on the bolts and face.
    A.ink(node, 0.04);
    inkHull(ico(R * 1.0, 2).translate(0, 0, 0), node, 0.05);
    const roll = keep(node);
    roll.name = 'roll';
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  });

  /** A helix curve for the wind column's ribbons. */
  function helix(rad0, rad1, h, turns, phase, y0) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28, a = phase + t * turns * TAU, rr = rad0 + (rad1 - rad0) * t;
      pts.push([Math.cos(a) * rr, y0 + t * h, Math.sin(a) * rr]);
    }
    return pts;
  }

  /** Geyser: a round marble vent that throws up a swirling 6 m column of wind. */
  hazard('wind_gust', 'geyser', 'isles', (r) => {
    const k = new Kit(r, true);
    k.add(new THREE.CylinderGeometry(1.15, 1.3, 0.3, 16), MARBLE, { p: [0, 0.15, 0], jit: 0.02 });
    k.add(new THREE.TorusGeometry(1.08, 0.1, 5, 20), SKYGOLD, { r: [HALF_PI, 0, 0], p: [0, 0.31, 0] });
    const swirl = paintFaces(disc([0.2, 0.4, 0.6, 0.8, 1], 24), (cx, cy, cz) =>
      ((Math.floor(Math.hypot(cx, cz) * 3.2 + Math.atan2(cz, cx) / TAU * 3) & 1) ? 0x9fe8ff : 0x4a6a9a), r, {});
    k.add(swirl, null, { s: [0.95, 1, 0.95], p: [0, 0.31, 0], noInk: true });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4;
      k.add(ico(0.1, 0), SKYGOLD, { p: [Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2] });
    }
    A.ink(k.root, 0.05);
    const out = finish(k);
    const ck = new Kit(r, true);
    ck.add(new THREE.CylinderGeometry(0.42, 0.34, 5.6, 10, 4), 0xc4f4ff, { p: [0, 3.0, 0], jit: 0.03 });
    [[0xffffff, 0], [0x8fe3f5, Math.PI]].forEach(([c, ph]) => ck.add(tubeGeo(helix(0.5, 0.6, 5.4, 2.5, ph, 0.3), 0.11, 56, 5), c, {}));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      puff(ck, Math.cos(a) * 0.4, 5.65, Math.sin(a) * 0.4, 0.34, 0.8, [WHITE, 0xdff7ff], 8);
    }
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.25, a = t * 2.5 * TAU + 1.2;
      ck.add(new THREE.OctahedronGeometry(0.16, 0), i === 1 ? 0xffa9cf : 0x7fd65c, { s: [1.3, 0.4, 0.8], r: [0, -a, 0.4], p: [Math.cos(a) * 0.52, 0.3 + t * 5.4, Math.sin(a) * 0.52], noInk: true });
    }
    A.ink(ck.root, 0.045);
    const column = flagInk(A.mergeByMaterial(ck.root));
    geyserRig(out, column);
    anim({ root: out }, column, 'spin', 'y', 2.6);
    return out;
  });

  /** Puddle: a shimmering rain puddle with a rainbow sheen ring. */
  hazard('rain_puddle', 'puddle', 'isles', (r) => {
    const k = new Kit(r, true), HW = 1.7, HL = 2.86, seed = r.next() * 99;
    const bands = [0xb197fc, 0x74c0fc, 0x8ce99a, 0xffe066, 0xffa94d, 0xff8787];
    const shape = puddleBase(k, [0.2, 0.42, 0.6, 0.7, 0.745, 0.79, 0.835, 0.88, 0.925, 0.955, 1], (rho, x, z) => {
      if (rho > 0.7 && rho < 0.925) return bands[Math.min(5, Math.floor((rho - 0.7) / 0.045))];
      if (rho > 0.925) return 0x6fb6e8;
      return hash3(Math.round(x * 2.5), 0, Math.round(z * 2.5), seed) > 0.45 ? 0xd8f3ff : 0x9fdcff;
    }, 0x2c5a8a, HW, HL);
    for (let i = 0; i < 2; i++) {
      k.add(new THREE.TorusGeometry(1, 0.03, 3, 28), 0xeaf8ff, { s: [0.45 + i * 0.35, 0.75 + i * 0.6, 1], r: [HALF_PI, 0, 0], p: [r.range(-0.2, 0.2), 0.03, r.range(-0.5, 0.5)], noInk: true });
    }
    for (let i = 0; i < 6; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.6;
      k.add(new THREE.OctahedronGeometry(0.1, 0), WHITE, { s: [1, 0.3, 1], p: [Math.cos(a) * d * HW, 0.04, Math.sin(a) * d * HL], noInk: true });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + r.range(-0.12, 0.12), s = shape(a) * 0.87, rad = 0.17 * r.range(0.8, 1.2);
      k.add(new THREE.SphereGeometry(rad, 8, 4, 0, TAU, 0, HALF_PI), i % 3 ? 0xf2f8ff : 0xd6ecff,
        { s: [1.4, 0.7, 1.4], p: [Math.cos(a) * s * HW, 0.02, Math.sin(a) * s * HL], jit: 0.03 });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  return { THEMES, DRESSING };
})();
